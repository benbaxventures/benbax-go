import { realtimeEvents } from '@benbax/shared';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  MessageSquareText,
  Navigation,
  Phone,
  PlayCircle,
  UserCheck,
  Users,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { ErrorState } from '../components/ErrorState';
import { OfflineBanner } from '../components/OfflineBanner';
import { SkeletonBlock } from '../components/SkeletonBlock';
import { useDriverLocation } from '../hooks/useDriverLocation';
import { useLiveLocation } from '../hooks/useLiveLocation';
import { useVoiceNavigation } from '../hooks/useVoiceNavigation';
import type { RootStackParamList } from '../navigation/types';
import { apiRequest, ApiResponseError } from '../services/api';
import { callPhone, openWhatsApp } from '../services/contact';
import {
  fetchDrivingRoute,
  haversineMeters,
  openExternalNavigation,
  type RouteResult,
} from '../services/directions';
import { acquireSharedSocket, onEveryConnect, releaseSharedSocket } from '../services/realtime';
import { useAuthStore } from '../store/authStore';
import { useDriverStore } from '../store/driverStore';
import { theme } from '../theme/tokens';

/** Re-fetch the live navigation route at most this often while driving. */
const ROUTE_REFRESH_MS = 30_000;
/** Within this distance of the pickup the "I've arrived" action is highlighted. */
const NEAR_PICKUP_METERS = 150;

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveTrip'>;

type Coordinate = {
  latitude: number;
  longitude: number;
};

type Stop = {
  id: string;
  label: string;
  latitude: string;
  longitude: string;
  completed: boolean;
};

type TripDetail = {
  id: string;
  pickupLatitude: string;
  pickupLongitude: string;
  dropoffLatitude: string;
  dropoffLongitude: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  pickupLandmark?: string | null;
  status: string;
  /** Decimal fields arrive as strings from the API. */
  totalFare?: string | number;
  distanceKm?: string | number;
  etaMinutes?: number;
  notes?: string | null;
  cancellationReason?: string | null;
  passengerName?: string;
  passenger?: { name?: string; phone?: string | null };
  passengerRating?: number;
  passengerCount?: number;
  stops?: Stop[];
  metadata?: {
    expectedRoute?: {
      polyline?: Coordinate[];
    };
  };
  trackingPoints?: Array<{
    latitude: string;
    longitude: string;
  }>;
};

async function loadMaps() {
  try {
    const maps = await import('react-native-maps');
    return maps;
  } catch {
    return null;
  }
}

import type { MapViewProps } from 'react-native-maps';

type MapsModule = {
  default: React.ComponentType<MapViewProps>;
  Marker: React.ComponentType<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  Polyline: React.ComponentType<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export function ActiveTripScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [mapsModule, setMapsModule] = useState<MapsModule | null>(null);
  const MapView = mapsModule?.default;
  const Marker = mapsModule?.Marker;
  const Polyline = mapsModule?.Polyline;
  const [driverPoint, setDriverPoint] = useState<Coordinate | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [navRoute, setNavRoute] = useState<RouteResult | null>(null);
  const lastRouteFetchRef = useRef({ at: 0, latitude: 0, longitude: 0, targetKey: '' });
  const queryClient = useQueryClient();
  const logout = useAuthStore((s) => s.logout);
  const setActiveTripId = useDriverStore((s) => s.setActiveTripId);
  const {
    steps,
    currentStep,
    currentStepIndex,
    isNavigating,
    voiceEnabled,
    startNavigation,
    updatePosition,
    stopNavigation,
    toggleVoice,
  } = useVoiceNavigation();

  useDriverLocation(route.params.tripId, true);
  // The driver's own GPS drives the map marker and the navigation route;
  // server echoes of tracking points are only a fallback.
  const live = useLiveLocation(true);

  const {
    data: trip,
    isLoading: tripLoading,
    isError: tripError,
    error: tripErr,
    refetch: refetchTrip,
  } = useQuery({
    queryKey: ['ride-trip', route.params.tripId],
    queryFn: () => apiRequest<TripDetail>(`/rides/${route.params.tripId}`),
  });

  const passengerName = trip?.passenger?.name ?? trip?.passengerName;
  const passengerPhone = trip?.passenger?.phone ?? null;

  useEffect(() => {
    loadMaps().then(setMapsModule);
  }, []);

  // A trip that ended (or was cancelled) is no longer "active" for Dispatch.
  const finishTrip = useCallback(() => {
    stopNavigation();
    setActiveTripId(null);
    queryClient.invalidateQueries({ queryKey: ['ride-trip', route.params.tripId] });
  }, [queryClient, route.params.tripId, setActiveTripId, stopNavigation]);

  useEffect(() => {
    const tripId = route.params.tripId;
    const socket = acquireSharedSocket();
    // Re-join the ride room after every reconnect, or updates stop arriving.
    const stopJoining = onEveryConnect(socket, () => socket.emit('ride:join', tripId));

    const onTrackingPoint = (point: { latitude: string | number; longitude: string | number }) => {
      setDriverPoint({ latitude: Number(point.latitude), longitude: Number(point.longitude) });
    };
    const onWarning = (warning: { message?: string }) => {
      Alert.alert('Safety warning', warning.message ?? 'Your trip route needs attention.', [
        { text: 'OK' },
      ]);
    };
    const onRideUpdated = (updated: { id?: string; status?: string }) => {
      if (updated?.id !== tripId) return;
      queryClient.invalidateQueries({ queryKey: ['ride-trip', tripId] });
      if (updated.status === 'CANCELLED') {
        finishTrip();
        Alert.alert('Ride cancelled', 'The passenger cancelled this ride.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    };

    socket.on(realtimeEvents.rideTrackingPoint, onTrackingPoint);
    socket.on(realtimeEvents.driverWarning, onWarning);
    socket.on(realtimeEvents.rideUpdated, onRideUpdated);

    return () => {
      stopJoining();
      socket.emit('ride:leave', tripId);
      socket.off(realtimeEvents.rideTrackingPoint, onTrackingPoint);
      socket.off(realtimeEvents.driverWarning, onWarning);
      socket.off(realtimeEvents.rideUpdated, onRideUpdated);
      releaseSharedSocket();
    };
  }, [finishTrip, navigation, queryClient, route.params.tripId]);

  const pickup = useMemo(
    () => ({
      latitude: Number(trip?.pickupLatitude ?? 5.6508),
      longitude: Number(trip?.pickupLongitude ?? -0.1668),
    }),
    [trip?.pickupLatitude, trip?.pickupLongitude]
  );
  const dropoff = useMemo(
    () => ({
      latitude: Number(trip?.dropoffLatitude ?? 5.556),
      longitude: Number(trip?.dropoffLongitude ?? -0.1824),
    }),
    [trip?.dropoffLatitude, trip?.dropoffLongitude]
  );

  // Set when the API predates the /start endpoint: the trip is treated as
  // started locally so the driver can still reach "End trip".
  const [startedLocally, setStartedLocally] = useState(false);
  const status = trip?.status ?? 'ASSIGNED';
  const inProgress = status === 'IN_PROGRESS' || (startedLocally && status === 'ARRIVED');
  const arrived = status === 'ARRIVED' && !inProgress;
  // Before the passenger is on board we head to the pickup; after, the drop-off.
  const headingTo: 'pickup' | 'dropoff' = inProgress ? 'dropoff' : 'pickup';
  const destination = headingTo === 'pickup' ? pickup : dropoff;

  const latestPoint = useMemo(() => {
    if (live.hasFix) return { latitude: live.latitude, longitude: live.longitude };
    const pt = driverPoint ?? trip?.trackingPoints?.[0];
    return pt
      ? {
          latitude: Number(pt.latitude),
          longitude: Number(pt.longitude),
        }
      : null;
  }, [live.hasFix, live.latitude, live.longitude, driverPoint, trip?.trackingPoints]);

  const metersToPickup = latestPoint ? haversineMeters(latestPoint, pickup) : null;
  const nearPickup = metersToPickup != null && metersToPickup <= NEAR_PICKUP_METERS;

  // Live route from where the driver is to the current destination. Refreshed
  // when the destination changes or the driver has moved on — not every tick.
  useEffect(() => {
    if (!trip || !latestPoint) return;
    const last = lastRouteFetchRef.current;
    const targetKey = `${headingTo}:${destination.latitude.toFixed(5)},${destination.longitude.toFixed(5)}`;
    const moved = haversineMeters(last, latestPoint);
    const due = Date.now() - last.at >= ROUTE_REFRESH_MS;
    if (targetKey === last.targetKey && !(due && moved > 100)) return;
    lastRouteFetchRef.current = { at: Date.now(), ...latestPoint, targetKey };
    fetchDrivingRoute(latestPoint, destination).then(setNavRoute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id, headingTo, destination.latitude, destination.longitude, latestPoint]);

  // Spoken turn-by-turn advances as the driver completes each step.
  useEffect(() => {
    if (isNavigating && latestPoint) updatePosition(latestPoint);
  }, [isNavigating, latestPoint, updatePosition]);

  // Switching leg (picked up the passenger) restarts guidance for the new leg.
  const navLegRef = useRef(headingTo);
  useEffect(() => {
    if (navLegRef.current === headingTo) return;
    navLegRef.current = headingTo;
    if (isNavigating) stopNavigation();
  }, [headingTo, isNavigating, stopNavigation]);

  const handleNavigate = useCallback(async () => {
    if (!trip) return;
    if (isNavigating) {
      stopNavigation();
      return;
    }
    // Make sure guidance uses a route that starts where the driver is now.
    const routeNow = latestPoint ? await fetchDrivingRoute(latestPoint, destination) : navRoute;
    if (routeNow) {
      setNavRoute(routeNow);
      if (latestPoint) {
        lastRouteFetchRef.current = {
          at: Date.now(),
          ...latestPoint,
          targetKey: `${headingTo}:${destination.latitude.toFixed(5)},${destination.longitude.toFixed(5)}`,
        };
      }
    }
    await startNavigation(
      String(destination.latitude),
      String(destination.longitude),
      routeNow?.steps
    );
  }, [
    trip,
    isNavigating,
    stopNavigation,
    latestPoint,
    destination,
    navRoute,
    headingTo,
    startNavigation,
  ]);

  const runAction = useCallback(
    async (key: string, path: string, onDone: () => void, fallbackError: string) => {
      setActionLoading(key);
      try {
        await apiRequest(path, { method: 'POST' });
        onDone();
        queryClient.invalidateQueries({ queryKey: ['ride-trip', route.params.tripId] });
      } catch (err) {
        if (err instanceof ApiResponseError && err.status === 401) {
          await logout();
          return;
        }
        Alert.alert('Error', err instanceof Error ? err.message : fallbackError);
      } finally {
        setActionLoading(null);
      }
    },
    [logout, queryClient, route.params.tripId]
  );

  const handleArrived = useCallback(
    () =>
      runAction(
        'arrived',
        `/rides/${route.params.tripId}/arrived`,
        () => {
          stopNavigation();
          Alert.alert('Marked as arrived', 'The passenger has been told you are here.');
        },
        'Could not mark as arrived.'
      ),
    [route.params.tripId, runAction, stopNavigation]
  );

  const handleStartTrip = useCallback(async () => {
    setActionLoading('start');
    try {
      await apiRequest(`/rides/${route.params.tripId}/start`, { method: 'POST' });
      stopNavigation();
      queryClient.invalidateQueries({ queryKey: ['ride-trip', route.params.tripId] });
    } catch (err) {
      if (err instanceof ApiResponseError && err.status === 404) {
        // Older API without a start step: completion is still allowed from
        // ARRIVED, so move on to the drop-off leg locally.
        stopNavigation();
        setStartedLocally(true);
      } else if (err instanceof ApiResponseError && err.status === 401) {
        await logout();
      } else {
        Alert.alert('Error', err instanceof Error ? err.message : 'Could not start the trip.');
      }
    } finally {
      setActionLoading(null);
    }
  }, [logout, queryClient, route.params.tripId, stopNavigation]);

  const handleEndTrip = useCallback(() => {
    Alert.alert('End trip?', 'Confirm the passenger has reached their destination.', [
      { text: 'Not yet', style: 'cancel' },
      {
        text: 'End trip',
        onPress: () =>
          void runAction(
            'end',
            `/rides/${route.params.tripId}/complete`,
            () => {
              finishTrip();
              Alert.alert('Trip completed', 'Thank you for completing this trip.', [
                { text: 'OK', onPress: () => navigation.goBack() },
              ]);
            },
            'Could not complete trip.'
          ),
      },
    ]);
  }, [finishTrip, navigation, route.params.tripId, runAction]);

  // The driver can't make it: hand the passenger to another driver instead of
  // cancelling their ride.
  const handleRelease = useCallback(() => {
    Alert.alert(
      "Can't make it?",
      'The ride goes back to other drivers and the passenger is matched again.',
      [
        { text: 'Keep ride', style: 'cancel' },
        {
          text: 'Release ride',
          style: 'destructive',
          onPress: () =>
            void runAction(
              'release',
              `/ride-dispatch/trips/${route.params.tripId}/release`,
              () => {
                finishTrip();
                navigation.goBack();
              },
              'Could not release this ride.'
            ),
        },
      ]
    );
  }, [finishTrip, navigation, route.params.tripId, runAction]);

  const handleCompleteStop = useCallback(
    async (stopId: string) => {
      try {
        await apiRequest(`/rides/${route.params.tripId}/stops/${stopId}/complete`, {
          method: 'POST',
        });
        queryClient.invalidateQueries({ queryKey: ['ride-trip', route.params.tripId] });
      } catch {
        Alert.alert('Error', 'Could not mark stop as complete.');
      }
    },
    [route.params.tripId, queryClient]
  );

  // The passenger's trip (pickup → drop-off), drawn faintly under the live route.
  const routePoints = useMemo(() => {
    if (trip?.metadata?.expectedRoute?.polyline?.length) {
      return trip.metadata.expectedRoute.polyline;
    }
    return [pickup, dropoff];
  }, [trip?.metadata?.expectedRoute?.polyline, pickup, dropoff]);

  const fareValue = Number(trip?.totalFare);
  const fare = Number.isFinite(fareValue) && fareValue > 0 ? fareValue : undefined;
  const distanceValue = Number(trip?.distanceKm);
  const distance = Number.isFinite(distanceValue) && distanceValue > 0 ? distanceValue : undefined;
  const duration = trip?.etaMinutes;
  const stops = trip?.stops ?? [];
  const pendingStops = stops.filter((s) => !s.completed);

  const formatDuration = (mins?: number) => {
    if (!mins) return '--';
    if (mins < 60) return `${Math.round(mins)} min`;
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return `${h}h ${m}m`;
  };

  const formatDistance = (km?: number) => {
    if (!km) return '--';
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(1)} km`;
  };

  if (tripLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.canvas, padding: 16 }}>
        <OfflineBanner />
        <SkeletonBlock height={40} borderRadius={20} style={{ marginBottom: 8 }} />
        <SkeletonBlock height={300} borderRadius={10} style={{ marginBottom: 16 }} />
        <SkeletonBlock height={60} borderRadius={14} style={{ marginBottom: 12 }} />
        <SkeletonBlock height={16} borderRadius={4} style={{ marginBottom: 8 }} />
        <SkeletonBlock height={16} borderRadius={4} style={{ marginBottom: 24 }} />
        <SkeletonBlock height={52} borderRadius={8} style={{ marginBottom: 10 }} />
        <SkeletonBlock height={52} borderRadius={8} />
      </View>
    );
  }

  if (tripError) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.canvas, padding: 16 }}>
        <OfflineBanner />
        <ErrorState
          title="Could not load trip"
          message={
            tripErr instanceof Error
              ? tripErr.message
              : 'Please check your connection and try again.'
          }
          onRetry={() => refetchTrip()}
        />
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ marginTop: 16, alignItems: 'center' }}
        >
          <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      {/* Full-screen Map */}
      {MapView && Marker && Polyline ? (
        <MapView
          style={{ flex: 1, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          initialCamera={{
            center: pickup,
            pitch: 45,
            heading: 0,
            zoom: 14,
            altitude: 1200,
          }}
          showsUserLocation
          showsMyLocationButton={false}
          showsBuildings
          rotateEnabled
          pitchEnabled
        >
          <Marker coordinate={pickup} title="Pickup" description={trip?.pickupLabel}>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: theme.colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 3,
                borderColor: '#fff',
              }}
            >
              <MapPin size={14} color="#fff" />
            </View>
          </Marker>
          <Marker coordinate={dropoff} title="Drop-off" description={trip?.dropoffLabel}>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: '#E53E3E',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 3,
                borderColor: '#fff',
              }}
            >
              <MapPin size={14} color="#fff" />
            </View>
          </Marker>
          {stops.map((stop, i) => (
            <Marker
              key={stop.id}
              coordinate={{
                latitude: Number(stop.latitude),
                longitude: Number(stop.longitude),
              }}
              title={`Stop ${i + 1}`}
              description={stop.label}
            >
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: stop.completed ? theme.colors.primary : theme.colors.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: '#fff',
                }}
              >
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>{i + 1}</Text>
              </View>
            </Marker>
          ))}
          {latestPoint ? (
            <Marker coordinate={latestPoint} title="You" anchor={{ x: 0.5, y: 0.5 }}>
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: theme.colors.primary,
                  borderWidth: 3,
                  borderColor: '#fff',
                }}
              />
            </Marker>
          ) : null}
          <Polyline
            coordinates={routePoints}
            strokeColor={theme.colors.primary + '55'}
            strokeWidth={4}
          />
          {navRoute && navRoute.coordinates.length > 1 ? (
            <Polyline
              coordinates={navRoute.coordinates}
              strokeColor={headingTo === 'pickup' ? '#F59E0B' : theme.colors.primary}
              strokeWidth={6}
            />
          ) : null}
        </MapView>
      ) : (
        <View
          style={{
            flex: 1,
            backgroundColor: theme.colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Navigation size={48} color={theme.colors.muted} />
          <Text style={{ color: theme.colors.ink, fontWeight: '900', fontSize: 18 }}>
            Map unavailable
          </Text>
          <Text style={{ color: theme.colors.muted, textAlign: 'center', paddingHorizontal: 32 }}>
            Build a development or production APK to test map rendering and live tracking.
          </Text>
        </View>
      )}

      {/* Top header overlay */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 16,
          right: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: '#fff',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            elevation: 4,
          }}
        >
          <Text style={{ fontSize: 18, color: theme.colors.ink }}>←</Text>
        </TouchableOpacity>
        <View
          style={{
            flex: 1,
            backgroundColor: '#fff',
            borderRadius: 20,
            paddingVertical: 8,
            paddingHorizontal: 14,
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            elevation: 4,
          }}
        >
          <Text style={{ color: theme.colors.ink, fontWeight: '700', fontSize: 13 }}>
            {trip?.pickupLabel ?? 'Pickup'} → {trip?.dropoffLabel ?? 'Destination'}
          </Text>
        </View>
        {/* Voice toggle */}
        <TouchableOpacity
          onPress={toggleVoice}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: '#fff',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            elevation: 4,
          }}
        >
          {voiceEnabled ? (
            <Volume2 size={18} color={theme.colors.primary} />
          ) : (
            <VolumeX size={18} color={theme.colors.muted} />
          )}
        </TouchableOpacity>
      </View>

      {/* Voice navigation banner */}
      {isNavigating && currentStep && (
        <View
          style={{
            position: 'absolute',
            top: insets.top + 60,
            left: 16,
            right: 16,
            backgroundColor: theme.colors.primary,
            borderRadius: 12,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: '#fff',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Navigation size={18} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>
              {currentStep.instruction}
            </Text>
            <Text style={{ color: '#D7FFF5', fontSize: 12 }}>{currentStep.distance}</Text>
          </View>
          <Text style={{ color: '#D7FFF5', fontSize: 11, fontWeight: '700' }}>
            {currentStepIndex + 1}/{steps.length}
          </Text>
        </View>
      )}

      {/* Arrived status banner */}
      {arrived ? (
        <View
          style={{
            position: 'absolute',
            top: insets.top + 60,
            left: 16,
            right: 16,
            backgroundColor: theme.colors.accent + '18',
            borderRadius: 12,
            padding: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: theme.colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <UserCheck size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.ink, fontWeight: '900', fontSize: 14 }}>
              You have arrived!
            </Text>
            <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
              Please meet your passenger at the pickup point.
            </Text>
          </View>
        </View>
      ) : null}

      {/* Bottom Sheet */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: '#fff',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          shadowColor: '#000',
          shadowOpacity: 0.15,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: -4 },
          elevation: 10,
          paddingBottom: insets.bottom + 8,
        }}
      >
        {/* Drag handle */}
        <View
          style={{
            alignSelf: 'center',
            width: 40,
            height: 4,
            borderRadius: 2,
            backgroundColor: theme.colors.border,
            marginTop: 10,
            marginBottom: 8,
          }}
        />

        {/* Phase: where to go next, live distance/ETA, and Google Maps hand-off */}
        <View
          style={{
            paddingHorizontal: 16,
            marginBottom: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <View
            style={{
              backgroundColor: arrived ? theme.colors.accent + '20' : theme.colors.primary + '15',
              borderRadius: 20,
              paddingVertical: 4,
              paddingHorizontal: 12,
            }}
          >
            <Text
              style={{
                color: arrived ? theme.colors.accent : theme.colors.primary,
                fontWeight: '800',
                fontSize: 12,
              }}
            >
              {arrived ? 'AT PICKUP' : inProgress ? 'TO DROP-OFF' : 'TO PICKUP'}
            </Text>
          </View>
          <Text style={{ flex: 1, color: theme.colors.muted, fontSize: 12 }} numberOfLines={1}>
            {!arrived && navRoute
              ? `${formatDistance(navRoute.distanceMeters / 1000)} · ${formatDuration(
                  navRoute.durationSeconds / 60
                )} away`
              : arrived
                ? 'Waiting for passenger'
                : ''}
          </Text>
          {!arrived ? (
            <TouchableOpacity
              onPress={() => void openExternalNavigation(destination)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${headingTo} in Google Maps`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 14,
                backgroundColor: theme.colors.primary + '14',
              }}
            >
              <ExternalLink size={14} color={theme.colors.primary} />
              <Text style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 12 }}>
                Maps
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Fare card */}
        <View
          style={{
            marginHorizontal: 16,
            backgroundColor: theme.colors.primary,
            borderRadius: 14,
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ gap: 2 }}>
            <Text style={{ color: '#D7FFF5', fontSize: 12, fontWeight: '700' }}>Trip fare</Text>
            <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900' }}>
              GHS {fare != null ? fare.toFixed(2) : '--'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <View style={{ alignItems: 'center', gap: 2 }}>
              <Clock size={16} color="#D7FFF5" />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                {formatDuration(duration)}
              </Text>
            </View>
            <View style={{ alignItems: 'center', gap: 2 }}>
              <MapPin size={16} color="#D7FFF5" />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                {formatDistance(distance)}
              </Text>
            </View>
          </View>
        </View>

        {/* Stops list */}
        {stops.length > 0 && (
          <View style={{ paddingHorizontal: 16, marginTop: 10, gap: 6 }}>
            <Text style={{ color: theme.colors.muted, fontSize: 11, fontWeight: '700' }}>
              STOPS ({pendingStops.length} remaining)
            </Text>
            {stops.map((stop, i) => (
              <View
                key={stop.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 8,
                  backgroundColor: stop.completed
                    ? theme.colors.primary + '10'
                    : theme.colors.canvas,
                }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: stop.completed ? theme.colors.primary : theme.colors.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {stop.completed ? (
                    <CheckCircle2 size={14} color="#fff" />
                  ) : (
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>{i + 1}</Text>
                  )}
                </View>
                <Text
                  style={{
                    flex: 1,
                    color: stop.completed ? theme.colors.muted : theme.colors.ink,
                    fontWeight: '700',
                    fontSize: 13,
                    textDecorationLine: stop.completed ? 'line-through' : 'none',
                  }}
                  numberOfLines={1}
                >
                  {stop.label}
                </Text>
                {!stop.completed && (
                  <TouchableOpacity onPress={() => handleCompleteStop(stop.id)}>
                    <Text style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 12 }}>
                      Done
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Location details */}
        <View style={{ paddingHorizontal: 16, marginTop: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: theme.colors.accent,
              }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.muted, fontSize: 11, fontWeight: '600' }}>
                PICKUP
              </Text>
              <Text
                style={{ color: theme.colors.ink, fontWeight: '700', fontSize: 14 }}
                numberOfLines={1}
              >
                {trip?.pickupLabel ?? 'Passenger pickup location'}
              </Text>
            </View>
          </View>
          <View
            style={{
              marginLeft: 3,
              width: 2,
              height: 12,
              backgroundColor: theme.colors.border,
              alignSelf: 'flex-start',
            }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: '#E53E3E',
              }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.muted, fontSize: 11, fontWeight: '600' }}>
                DROP-OFF
              </Text>
              <Text
                style={{ color: theme.colors.ink, fontWeight: '700', fontSize: 14 }}
                numberOfLines={1}
              >
                {trip?.dropoffLabel ?? 'Destination'}
              </Text>
            </View>
          </View>
        </View>

        {/* Passenger info */}
        {passengerName ? (
          <View
            style={{
              marginHorizontal: 16,
              marginTop: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: theme.colors.primary + '20',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 13 }}>
                {passengerName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={{ color: theme.colors.ink, fontWeight: '600', fontSize: 13 }}>
              {passengerName}
            </Text>
            {trip?.passengerRating != null && (
              <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                ★ {trip.passengerRating.toFixed(1)}
              </Text>
            )}
            {trip?.passengerCount != null && trip.passengerCount > 1 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Users size={14} color={theme.colors.muted} />
                <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                  ×{trip.passengerCount}
                </Text>
              </View>
            ) : null}
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              onPress={() => callPhone(passengerPhone)}
              disabled={!passengerPhone}
              accessibilityRole="button"
              accessibilityLabel="Call passenger"
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: theme.colors.primary + '14',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: passengerPhone ? 1 : 0.4,
              }}
            >
              <Phone size={16} color={theme.colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                openWhatsApp(passengerPhone, 'Hello, this is your Benbax driver. I am on my way.')
              }
              disabled={!passengerPhone}
              accessibilityRole="button"
              accessibilityLabel="Message passenger on WhatsApp"
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: '#22C55E1A',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: passengerPhone ? 1 : 0.4,
              }}
            >
              <MessageSquareText size={16} color="#16A34A" />
            </TouchableOpacity>
          </View>
        ) : null}

        {trip?.notes ? (
          <Text
            style={{ marginHorizontal: 16, marginTop: 8, color: theme.colors.muted, fontSize: 12 }}
          >
            Note from passenger: “{trip.notes}”
          </Text>
        ) : null}

        {/* Action buttons — follow the trip: pickup → arrived → on trip → done */}
        <View style={{ paddingHorizontal: 16, marginTop: 14, gap: 10 }}>
          {!arrived ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button
                  label={
                    isNavigating
                      ? 'Stop nav'
                      : headingTo === 'pickup'
                        ? 'Navigate to pickup'
                        : 'Navigate to drop-off'
                  }
                  icon={<Navigation size={18} color="#fff" />}
                  onPress={handleNavigate}
                  variant={isNavigating ? 'danger' : 'primary'}
                />
              </View>
              {!inProgress ? (
                <View style={{ flex: 1 }}>
                  <Button
                    label="I've arrived"
                    icon={<UserCheck size={18} color={nearPickup ? '#fff' : theme.colors.ink} />}
                    onPress={handleArrived}
                    variant={nearPickup ? 'primary' : 'secondary'}
                    loading={actionLoading === 'arrived'}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
          {arrived ? (
            <Button
              label="Passenger on board — start trip"
              icon={<PlayCircle size={18} color="#fff" />}
              onPress={() => void handleStartTrip()}
              loading={actionLoading === 'start'}
            />
          ) : null}
          {inProgress ? (
            <Button
              label="End trip"
              icon={<CheckCircle2 size={18} color="#fff" />}
              onPress={handleEndTrip}
              loading={actionLoading === 'end'}
            />
          ) : (
            <TouchableOpacity
              onPress={handleRelease}
              disabled={actionLoading != null}
              accessibilityRole="button"
              accessibilityLabel="Release this ride to another driver"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 6,
              }}
            >
              <XCircle size={14} color={theme.colors.danger} />
              <Text style={{ color: theme.colors.danger, fontWeight: '700', fontSize: 13 }}>
                {actionLoading === 'release' ? 'Releasing…' : "Can't make it? Release ride"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}
