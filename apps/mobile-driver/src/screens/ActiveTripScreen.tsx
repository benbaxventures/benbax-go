import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CheckCircle2, Navigation, UserCheck } from 'lucide-react-native';
import { Alert, Text, View } from 'react-native';
import { realtimeEvents } from '@benbax/shared';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { useDriverLocation } from '../hooks/useDriverLocation';
import { apiRequest } from '../services/api';
import { createRealtimeClient } from '../services/realtime';
import { theme } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveTrip'>;

type Coordinate = {
  latitude: number;
  longitude: number;
};

type TripDetail = {
  id: string;
  pickupLatitude: string;
  pickupLongitude: string;
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
};

function loadMaps() {
  try {
    return require('react-native-maps') as typeof import('react-native-maps');
  } catch {
    return null;
  }
}

export function ActiveTripScreen({ route }: Props) {
  const maps = loadMaps();
  const MapView = maps?.default;
  const Marker = maps?.Marker;
  const Polyline = maps?.Polyline;
  const [driverPoint, setDriverPoint] = useState<Coordinate | null>(null);
  useDriverLocation(route.params.tripId, true);
  const { data: trip } = useQuery({
    queryKey: ['ride-trip', route.params.tripId],
    queryFn: () => apiRequest<TripDetail>(`/rides/${route.params.tripId}`)
  });

  useEffect(() => {
    let cleanup: () => void = () => undefined;

    createRealtimeClient().then((socket) => {
      socket.emit('ride:join', route.params.tripId);
      socket.on(realtimeEvents.rideTrackingPoint, (point) => {
        setDriverPoint({ latitude: Number(point.latitude), longitude: Number(point.longitude) });
      });
      socket.on(realtimeEvents.driverWarning, (warning) => {
        Alert.alert('Safety warning', warning.message ?? 'Your trip route needs attention.');
      });
      cleanup = () => socket.disconnect();
    });

    return () => cleanup();
  }, [route.params.tripId]);

  const pickup = useMemo(
    () => ({
      latitude: Number(trip?.pickupLatitude ?? 5.6508),
      longitude: Number(trip?.pickupLongitude ?? -0.1668)
    }),
    [trip?.pickupLatitude, trip?.pickupLongitude]
  );
  const dropoff = useMemo(
    () => ({
      latitude: Number(trip?.dropoffLatitude ?? 5.556),
      longitude: Number(trip?.dropoffLongitude ?? -0.1824)
    }),
    [trip?.dropoffLatitude, trip?.dropoffLongitude]
  );
  const latestPoint = driverPoint ?? trip?.trackingPoints?.[0]
    ? {
        latitude: Number((driverPoint ?? trip?.trackingPoints?.[0])?.latitude),
        longitude: Number((driverPoint ?? trip?.trackingPoints?.[0])?.longitude)
      }
    : null;
  const routePoints = trip?.metadata?.expectedRoute?.polyline?.length
    ? trip.metadata.expectedRoute.polyline
    : latestPoint
      ? [pickup, latestPoint, dropoff]
      : [pickup, dropoff];

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, gap: 12 }}>
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 24, fontWeight: '900', color: theme.colors.ink }}>Active ride</Text>
          <Text style={{ color: theme.colors.muted }}>Passenger pickup, route guidance, live GPS, and safety controls.</Text>
        </View>
        {MapView && Marker && Polyline ? (
          <MapView
            style={{ flex: 1, borderRadius: 8, overflow: 'hidden' }}
            initialRegion={{
              latitude: pickup.latitude,
              longitude: pickup.longitude,
              latitudeDelta: 0.12,
              longitudeDelta: 0.12
            }}
          >
            <Marker coordinate={pickup} title="Passenger pickup" />
            <Marker coordinate={dropoff} title="Destination" />
            {latestPoint ? <Marker coordinate={latestPoint} title="Your current position" pinColor={theme.colors.primary} /> : null}
            <Polyline coordinates={routePoints} strokeColor={theme.colors.primary} strokeWidth={4} />
          </MapView>
        ) : (
          <View style={{ flex: 1, borderRadius: 8, backgroundColor: theme.colors.surface, padding: 16, justifyContent: 'center', gap: 8 }}>
            <Text style={{ color: theme.colors.ink, fontWeight: '900' }}>Map unavailable</Text>
            <Text style={{ color: theme.colors.muted }}>This runtime does not include the native maps module. Build a development or production app to test map rendering.</Text>
          </View>
        )}
        <View style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 14, gap: 10 }}>
          <Text style={{ color: theme.colors.ink, fontWeight: '900' }}>Passenger pickup</Text>
          <Text style={{ color: theme.colors.muted }}>Confirm the passenger, start the trip, and keep location sharing active until drop-off.</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button label="Navigate" icon={<Navigation size={18} color="#fff" />} onPress={() => undefined} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Arrived" icon={<UserCheck size={18} color={theme.colors.ink} />} onPress={() => undefined} variant="secondary" />
            </View>
          </View>
          <Button label="End trip" icon={<CheckCircle2 size={18} color="#fff" />} onPress={() => undefined} />
        </View>
      </View>
    </Screen>
  );
}
