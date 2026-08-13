import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, MapPin, MessageSquareText, Navigation, Phone } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { MapPinLabel } from '../components/MapPinLabel';
import { MapMarker, MapPolyline, MapView } from '../components/MapView';
import { StatusPill } from '../components/StatusPill';
import type { RootStackParamList } from '../navigation/types';
import { apiRequest } from '../services/api';
import { BENBAX_PHONE, callPhone, openWhatsApp } from '../services/contact';
import { createRealtimeClient } from '../services/realtime';
import { realtimeEvents } from '../shared';
import { theme } from '../theme/tokens';

type Coordinate = {
  latitude: number;
  longitude: number;
};

type DriverInfo = {
  user?: { name?: string; fullName?: string; phone?: string };
  vehicle?: {
    type?: string;
    plateNumber?: string | null;
    color?: string | null;
    make?: string | null;
    model?: string | null;
  };
  currentLatitude?: string | number | null;
  currentLongitude?: string | number | null;
};

type TripDetail = {
  id: string;
  tripCode: string;
  status: string;
  scheduledFor?: string | null;
  pickupLabel: string;
  pickupLatitude: string;
  pickupLongitude: string;
  dropoffLabel: string;
  dropoffLatitude: string;
  dropoffLongitude: string;
  metadata?: {
    expectedRoute?: {
      polyline?: Coordinate[];
    };
  };
  trackingPoints?: Array<{
    latitude: string;
    longitude: string;
  }>;
  assignments?: Array<{
    status: string;
    driverProfile?: DriverInfo;
  }>;
};

type TripAssignmentEvent = {
  tripId: string;
  status: string;
  driverProfile?: DriverInfo;
};

type Props = NativeStackScreenProps<RootStackParamList, 'TripTracking'>;

export function TripTrackingScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [driverPoint, setDriverPoint] = useState<Coordinate | null>(null);
  const [liveStatus, setLiveStatus] = useState('REQUESTED');
  const [assignedDriver, setAssignedDriver] = useState<DriverInfo | null>(null);

  const {
    data: trip,
    refetch,
    isLoading,
  } = useQuery({
    queryKey: ['trip', route.params.tripId],
    queryFn: () => apiRequest<TripDetail>(`/rides/${route.params.tripId}`),
  });

  useEffect(() => {
    if (trip?.status) setLiveStatus(trip.status);
    const accepted =
      trip?.assignments?.find((assignment) => assignment.status === 'ACCEPTED') ??
      trip?.assignments?.[0];
    if (accepted?.driverProfile) setAssignedDriver(accepted.driverProfile);
  }, [trip]);

  useEffect(() => {
    let cleanup: () => void = () => undefined;

    createRealtimeClient().then((socket) => {
      socket.emit('ride:join', route.params.tripId);
      socket.on(realtimeEvents.carTripUpdated, (updatedTrip: TripDetail) => {
        if (updatedTrip.id !== route.params.tripId) return;
        setLiveStatus(updatedTrip.status ?? 'REQUESTED');
        refetch();
      });
      socket.on(realtimeEvents.carTripAssigned, (assignment: TripAssignmentEvent) => {
        if (assignment.tripId !== route.params.tripId) return;
        setLiveStatus(assignment.status === 'ACCEPTED' ? 'ASSIGNED' : 'ASSIGNING');
        if (assignment.driverProfile) {
          setAssignedDriver(assignment.driverProfile);
        }
        Alert.alert(
          assignment.status === 'ACCEPTED' ? 'Driver assigned' : 'Driver found',
          assignment.status === 'ACCEPTED'
            ? 'Your driver accepted the ride and is on the way.'
            : 'A nearby driver has received your request.'
        );
        refetch();
      });
      socket.on(
        realtimeEvents.carTripTrackingPoint,
        (point: { latitude: string | number; longitude: string | number }) => {
          setDriverPoint({ latitude: Number(point.latitude), longitude: Number(point.longitude) });
        }
      );
      cleanup = () => {
        socket.emit('ride:leave', route.params.tripId);
        socket.disconnect();
      };
    });

    return () => cleanup();
  }, [refetch, route.params.tripId]);

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

  // Only a real, live driver position is shown — never the driver profile's
  // stored coordinates, which can be stale (from a previous trip/session) and
  // would put the yellow pin in the wrong place.
  const latestPoint: Coordinate | null = useMemo(() => {
    if (driverPoint) return driverPoint;
    if (trip?.trackingPoints?.[0]) {
      return {
        latitude: Number(trip.trackingPoints[0].latitude),
        longitude: Number(trip.trackingPoints[0].longitude),
      };
    }
    return null;
  }, [driverPoint, trip?.trackingPoints]);

  const routePoints = useMemo(() => {
    if (trip?.metadata?.expectedRoute?.polyline?.length) {
      return trip.metadata.expectedRoute.polyline;
    }
    return latestPoint ? [pickup, latestPoint, dropoff] : [pickup, dropoff];
  }, [trip?.metadata?.expectedRoute?.polyline, pickup, latestPoint, dropoff]);

  const estimatedRegion = useMemo(() => {
    if (latestPoint) {
      return {
        latitude: latestPoint.latitude,
        longitude: latestPoint.longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      };
    }
    return {
      latitude: (pickup.latitude + dropoff.latitude) / 2,
      longitude: (pickup.longitude + dropoff.longitude) / 2,
      latitudeDelta: 0.12,
      longitudeDelta: 0.12,
    };
  }, [latestPoint, pickup, dropoff]);

  const driverName = assignedDriver?.user?.name ?? assignedDriver?.user?.fullName ?? 'Driver';
  const vehicle = assignedDriver?.vehicle;
  const vehicleLabel = [vehicle?.color, vehicle?.make, vehicle?.model, vehicle?.plateNumber]
    .filter(Boolean)
    .join(' · ');
  const isScheduledFuture = trip?.scheduledFor
    ? new Date(trip.scheduledFor).getTime() > Date.now()
    : false;

  const statusLabel =
    isScheduledFuture && !assignedDriver
      ? 'Scheduled'
      : liveStatus === 'NO_AVAILABLE_DRIVERS'
        ? 'No drivers online'
        : liveStatus === 'REQUESTED'
          ? 'Matching driver'
          : liveStatus === 'ASSIGNING'
            ? 'Driver found'
            : liveStatus.replaceAll('_', ' ').toLowerCase();

  const statusTone = liveStatus === 'NO_AVAILABLE_DRIVERS' ? 'warning' : 'success';

  function openDriverMap() {
    if (!latestPoint) {
      Alert.alert(
        'Driver location unavailable',
        'The driver location will appear when the driver shares GPS.'
      );
      return;
    }
    Alert.alert('Open in Maps', 'View driver location in Google Maps?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Open',
        onPress: () => {
          const query = `${latestPoint!.latitude},${latestPoint!.longitude}`;
          Linking.openURL(
            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
          ).catch(() => {
            Alert.alert('Map unavailable', 'Could not open Google Maps on this device.');
          });
        },
      },
    ]);
  }

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.canvas,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* === FULL-SCREEN MAP === */}
      <MapView
        initialRegion={estimatedRegion}
        showsUserLocation
        showsMyLocationButton={false}
        style={{ flex: 1 }}
      >
        <MapMarker
          coordinate={pickup}
          title="Pickup"
          pinColor={theme.colors.primary}
          anchor={{ x: 0.5, y: 1 }}
        >
          <MapPinLabel color={theme.colors.primary} title="Pickup" subtitle={trip?.pickupLabel} />
        </MapMarker>
        <MapMarker
          coordinate={dropoff}
          title="Destination"
          pinColor="#EF4444"
          anchor={{ x: 0.5, y: 1 }}
        >
          <MapPinLabel color="#EF4444" title="Dropoff" subtitle={trip?.dropoffLabel} />
        </MapMarker>
        {latestPoint ? (
          <MapMarker
            coordinate={latestPoint}
            title="Driver"
            pinColor={theme.colors.accent}
            zIndex={10}
            anchor={{ x: 0.5, y: 1 }}
          >
            <MapPinLabel color={theme.colors.accent} title="Driver" subtitle={driverName} />
          </MapMarker>
        ) : null}
        <MapPolyline coordinates={routePoints} strokeColor={theme.colors.primary} strokeWidth={4} />
      </MapView>

      {/* === BACK BUTTON === */}
      <Pressable
        onPress={() => navigation.goBack()}
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 16,
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: '#fff',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.15,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 4,
        }}
      >
        <ChevronLeft size={22} color={theme.colors.ink} />
      </Pressable>

      {/* === STATUS BADGE (top right) === */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + 12,
          right: 16,
        }}
      >
        <StatusPill label={statusLabel} tone={statusTone} />
      </View>

      {/* === BOTTOM INFO CARD === */}
      <View
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: insets.bottom + 16,
          backgroundColor: '#fff',
          borderRadius: 20,
          padding: 20,
          shadowColor: '#000',
          shadowOpacity: 0.15,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: -4 },
          elevation: 10,
        }}
      >
        {/* Status + Trip Code */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: theme.colors.success,
              }}
            />
            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.success }}>
              {assignedDriver ? 'On the way' : statusLabel}
            </Text>
          </View>
          {trip?.tripCode ? (
            <View
              style={{
                backgroundColor: theme.colors.surfaceMuted,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.muted }}>
                #{trip.tripCode}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Driver info */}
        {assignedDriver ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: theme.colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: '800', color: theme.colors.ink }}>
                {driverName[0]}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: theme.colors.ink }}>
                {driverName}
              </Text>
              <Text style={{ fontSize: 13, color: theme.colors.muted, marginTop: 2 }}>
                {vehicleLabel || 'Vehicle details pending'}
              </Text>
            </View>
          </View>
        ) : (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: theme.colors.ink }}>
              {isScheduledFuture
                ? 'Driver matching starts near pickup time'
                : 'Finding a nearby driver...'}
            </Text>
            <Text style={{ fontSize: 13, color: theme.colors.muted, marginTop: 4 }}>
              {isScheduledFuture
                ? `Scheduled for ${new Date(trip?.scheduledFor ?? Date.now()).toLocaleString()}.`
                : 'Please wait while we connect you with the nearest available driver.'}
            </Text>
          </View>
        )}

        {/* Location summary */}
        <View
          style={{
            gap: 8,
            marginBottom: 16,
            backgroundColor: theme.colors.surfaceMuted,
            borderRadius: 12,
            padding: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MapPin size={14} color={theme.colors.primary} />
            <Text style={{ fontSize: 13, color: theme.colors.ink, flex: 1 }} numberOfLines={1}>
              {trip?.pickupLabel ?? 'Pickup'}
            </Text>
          </View>
          <View style={{ height: 1, backgroundColor: theme.colors.border, marginLeft: 7 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MapPin size={14} color="#EF4444" />
            <Text style={{ fontSize: 13, color: theme.colors.ink, flex: 1 }} numberOfLines={1}>
              {trip?.dropoffLabel ?? 'Destination'}
            </Text>
          </View>
        </View>

        {/* Action buttons */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button
              label="Call"
              icon={<Phone size={18} color="#fff" />}
              onPress={() => callPhone(assignedDriver?.user?.phone ?? BENBAX_PHONE)}
              disabled={!assignedDriver}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="WhatsApp"
              icon={<MessageSquareText size={18} color={theme.colors.ink} />}
              onPress={() => openWhatsApp(assignedDriver?.user?.phone ?? BENBAX_PHONE)}
              variant="secondary"
              disabled={!assignedDriver}
            />
          </View>
          <Pressable
            onPress={openDriverMap}
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              backgroundColor: theme.colors.surfaceMuted,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Navigation size={20} color={theme.colors.primary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
