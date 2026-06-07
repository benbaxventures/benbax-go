import { realtimeEvents } from '@benbax/shared';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { Camera, CheckCircle2, Navigation } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { useRiderLocation } from '../hooks/useRiderLocation';
import type { RootStackParamList } from '../navigation/types';
import { apiRequest } from '../services/api';
import { createRealtimeClient } from '../services/realtime';
import { theme } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveDelivery'>;

type Coordinate = {
  latitude: number;
  longitude: number;
};

type DeliveryDetail = {
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
  Marker: React.ComponentType<any>;
  Polyline: React.ComponentType<any>;
};

export function ActiveDeliveryScreen({ route }: Props) {
  const [mapsModule, setMapsModule] = useState<MapsModule | null>(null);
  const MapView = mapsModule?.default;
  const Marker = mapsModule?.Marker;
  const Polyline = mapsModule?.Polyline;
  const [riderPoint, setRiderPoint] = useState<Coordinate | null>(null);
  useRiderLocation(route.params.deliveryId, true);

  useEffect(() => {
    loadMaps().then(setMapsModule);
  }, []);
  const { data: delivery } = useQuery({
    queryKey: ['delivery', route.params.deliveryId],
    queryFn: () => apiRequest<DeliveryDetail>(`/deliveries/${route.params.deliveryId}`),
  });

  useEffect(() => {
    let cleanup: () => void = () => undefined;

    createRealtimeClient().then((socket) => {
      socket.emit('delivery:join', route.params.deliveryId);
      socket.on(realtimeEvents.trackingPoint, (point) => {
        setRiderPoint({ latitude: Number(point.latitude), longitude: Number(point.longitude) });
      });
      socket.on(realtimeEvents.riderWarning, (warning) => {
        Alert.alert('Safety warning', warning.message ?? 'Your delivery route needs attention.');
      });
      cleanup = () => {
        socket.emit('delivery:leave', route.params.deliveryId);
        socket.disconnect();
      };
    });

    return () => cleanup();
  }, [route.params.deliveryId]);

  const pickup = useMemo(
    () => ({
      latitude: Number(delivery?.pickupLatitude ?? 5.6508),
      longitude: Number(delivery?.pickupLongitude ?? -0.1668),
    }),
    [delivery?.pickupLatitude, delivery?.pickupLongitude]
  );
  const dropoff = useMemo(
    () => ({
      latitude: Number(delivery?.dropoffLatitude ?? 5.556),
      longitude: Number(delivery?.dropoffLongitude ?? -0.1824),
    }),
    [delivery?.dropoffLatitude, delivery?.dropoffLongitude]
  );
  const latestPoint =
    (riderPoint ?? delivery?.trackingPoints?.[0])
      ? {
          latitude: Number((riderPoint ?? delivery?.trackingPoints?.[0])?.latitude),
          longitude: Number((riderPoint ?? delivery?.trackingPoints?.[0])?.longitude),
        }
      : null;
  const routePoints = delivery?.metadata?.expectedRoute?.polyline?.length
    ? delivery.metadata.expectedRoute.polyline
    : latestPoint
      ? [pickup, latestPoint, dropoff]
      : [pickup, dropoff];

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, gap: 12 }}>
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 24, fontWeight: '900', color: theme.colors.ink }}>
            Active delivery
          </Text>
          <Text style={{ color: theme.colors.muted }}>
            Route guidance, live GPS, OTP, and proof capture.
          </Text>
        </View>
        {MapView && Marker && Polyline ? (
          <MapView
            style={{ flex: 1, borderRadius: 8, overflow: 'hidden' }}
            initialRegion={{
              latitude: pickup.latitude,
              longitude: pickup.longitude,
              latitudeDelta: 0.12,
              longitudeDelta: 0.12,
            }}
          >
            <Marker coordinate={pickup} title="Pickup" />
            <Marker coordinate={dropoff} title="Drop-off" />
            {latestPoint ? (
              <Marker
                coordinate={latestPoint}
                title="Your current position"
                pinColor={theme.colors.primary}
              />
            ) : null}
            <Polyline
              coordinates={routePoints}
              strokeColor={theme.colors.primary}
              strokeWidth={4}
            />
          </MapView>
        ) : (
          <View
            style={{
              flex: 1,
              borderRadius: 8,
              backgroundColor: theme.colors.surface,
              padding: 16,
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Text style={{ color: theme.colors.ink, fontWeight: '900' }}>Map unavailable</Text>
            <Text style={{ color: theme.colors.muted }}>
              Build a development or production app to test map rendering.
            </Text>
          </View>
        )}
        <View
          style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 14, gap: 10 }}
        >
          <Text style={{ color: theme.colors.ink, fontWeight: '900' }}>
            OTP required at delivery
          </Text>
          <Text style={{ color: theme.colors.muted }}>
            Ask the customer for OTP before marking complete.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Navigate"
                icon={<Navigation size={18} color="#fff" />}
                onPress={() => undefined}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Proof"
                icon={<Camera size={18} color={theme.colors.ink} />}
                onPress={() => undefined}
                variant="secondary"
              />
            </View>
          </View>
          <Button
            label="Complete delivery"
            icon={<CheckCircle2 size={18} color="#fff" />}
            onPress={() => undefined}
          />
        </View>
      </View>
    </Screen>
  );
}
