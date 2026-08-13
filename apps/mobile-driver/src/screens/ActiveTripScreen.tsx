import { realtimeEvents } from '@benbax/shared';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock,
  MapPin,
  Navigation,
  UserCheck,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { ErrorState } from '../components/ErrorState';
import { OfflineBanner } from '../components/OfflineBanner';
import { SkeletonBlock } from '../components/SkeletonBlock';
import { useDriverLocation } from '../hooks/useDriverLocation';
import { useVoiceNavigation } from '../hooks/useVoiceNavigation';
import type { RootStackParamList } from '../navigation/types';
import { apiRequest, ApiResponseError } from '../services/api';
import { createRealtimeClient } from '../services/realtime';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme/tokens';

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
  status: string;
  estimatedFare?: number;
  estimatedDistance?: number;
  estimatedDuration?: number;
  passengerName?: string;
  passenger?: { name?: string };
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
  const queryClient = useQueryClient();
  const logout = useAuthStore((s) => s.logout);
  const {
    steps,
    currentStep,
    currentStepIndex,
    isNavigating,
    voiceEnabled,
    startNavigation,
    stopNavigation,
    toggleVoice,
  } = useVoiceNavigation();

  useDriverLocation(route.params.tripId, true);

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

  useEffect(() => {
    loadMaps().then(setMapsModule);
  }, []);

  useEffect(() => {
    let cleanup: () => void = () => undefined;

    createRealtimeClient().then((socket) => {
      socket.emit('ride:join', route.params.tripId);
      socket.on(realtimeEvents.rideTrackingPoint, (point) => {
        setDriverPoint({ latitude: Number(point.latitude), longitude: Number(point.longitude) });
      });
      socket.on(realtimeEvents.driverWarning, (warning) => {
        Alert.alert('Safety warning', warning.message ?? 'Your trip route needs attention.', [
          { text: 'OK' },
        ]);
      });
      cleanup = () => socket.disconnect();
    });

    return () => cleanup();
  }, [route.params.tripId]);

  const handleNavigate = useCallback(async () => {
    if (!trip) return;
    const lat = trip.dropoffLatitude;
    const lng = trip.dropoffLongitude;

    if (isNavigating) {
      stopNavigation();
      return;
    }

    await startNavigation(lat, lng);
  }, [trip, isNavigating, startNavigation, stopNavigation]);

  const handleArrived = useCallback(async () => {
    setActionLoading('arrived');
    try {
      await apiRequest(`/rides/${route.params.tripId}/arrived`, { method: 'POST' });
      Alert.alert('Marked as arrived', 'Let the passenger know you have arrived.');
      queryClient.invalidateQueries({ queryKey: ['ride-trip', route.params.tripId] });
    } catch (err) {
      if (err instanceof ApiResponseError && err.status === 401) {
        await logout();
        return;
      }
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not mark as arrived.');
    } finally {
      setActionLoading(null);
    }
  }, [route.params.tripId, queryClient, logout]);

  const handleEndTrip = useCallback(async () => {
    setActionLoading('end');
    try {
      await apiRequest(`/rides/${route.params.tripId}/complete`, { method: 'POST' });
      stopNavigation();
      Alert.alert('Trip completed', 'Thank you for completing this trip.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
      queryClient.invalidateQueries({ queryKey: ['ride-trip', route.params.tripId] });
    } catch (err) {
      if (err instanceof ApiResponseError && err.status === 401) {
        await logout();
        return;
      }
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not complete trip.');
    } finally {
      setActionLoading(null);
    }
  }, [route.params.tripId, navigation, queryClient, logout, stopNavigation]);

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
  const latestPoint = useMemo(() => {
    const pt = driverPoint ?? trip?.trackingPoints?.[0];
    return pt
      ? {
          latitude: Number(pt.latitude),
          longitude: Number(pt.longitude),
        }
      : null;
  }, [driverPoint, trip?.trackingPoints]);

  const routePoints = useMemo(() => {
    if (trip?.metadata?.expectedRoute?.polyline?.length) {
      return trip.metadata.expectedRoute.polyline;
    }
    if (latestPoint) return [pickup, latestPoint, dropoff];
    return [pickup, dropoff];
  }, [trip?.metadata?.expectedRoute?.polyline, pickup, dropoff, latestPoint]);

  const fare = trip?.estimatedFare;
  const distance = trip?.estimatedDistance;
  const duration = trip?.estimatedDuration;
  const arrived = trip?.status === 'ARRIVED';
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
          <Polyline coordinates={routePoints} strokeColor={theme.colors.primary} strokeWidth={4} />
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

        {/* Status badge */}
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <View
            style={{
              alignSelf: 'flex-start',
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
              {arrived ? 'ARRIVED' : 'ACTIVE RIDE'}
            </Text>
          </View>
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
          </View>
        ) : null}

        {/* Action buttons */}
        <View style={{ paddingHorizontal: 16, marginTop: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button
                label={isNavigating ? 'Stop nav' : 'Navigate'}
                icon={<Navigation size={18} color="#fff" />}
                onPress={handleNavigate}
                variant={isNavigating ? 'danger' : 'primary'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={arrived ? 'Arrived ✓' : 'Arrived'}
                icon={<UserCheck size={18} color={arrived ? '#fff' : theme.colors.ink} />}
                onPress={handleArrived}
                variant={arrived ? 'primary' : 'secondary'}
                loading={actionLoading === 'arrived'}
              />
            </View>
          </View>
          <Button
            label="End trip"
            icon={<CheckCircle2 size={18} color="#fff" />}
            onPress={handleEndTrip}
            loading={actionLoading === 'end'}
          />
        </View>
      </View>
    </View>
  );
}
