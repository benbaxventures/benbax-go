import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Phone, ShieldCheck } from 'lucide-react-native';
import { ActivityIndicator, Text, View } from 'react-native';
import { realtimeEvents } from '../shared';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { StatusPill } from '../components/StatusPill';
import { apiRequest } from '../services/api';
import { createRealtimeClient } from '../services/realtime';
import { theme } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

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
  assignments?: Array<{
    riderProfile?: {
      user?: { fullName?: string };
      vehicle?: { type?: string; plateNumber?: string | null };
    };
  }>;
};

type Props = NativeStackScreenProps<RootStackParamList, 'Tracking'>;

function LazyMap({ pickup, dropoff, latestPoint, routePoints }: {
  pickup: Coordinate;
  dropoff: Coordinate;
  latestPoint: Coordinate | null;
  routePoints: Coordinate[];
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modulesRef = useRef<{
    MapView: any;
    Marker: any;
    Polyline: any;
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const mod = await import('react-native-maps');
        modulesRef.current = {
          MapView: mod.default,
          Marker: mod.Marker,
          Polyline: mod.Polyline
        };
        setLoaded(true);
      } catch {
        setError('Map view is not available on this device.');
      }
    })();
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, borderRadius: 8, backgroundColor: theme.colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: theme.colors.muted }}>{error}</Text>
      </View>
    );
  }

  if (!loaded) {
    return (
      <View style={{ flex: 1, borderRadius: 8, backgroundColor: theme.colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  const { MapView, Marker, Polyline } = modulesRef.current!;
  return (
    <MapView
      style={{ flex: 1, borderRadius: 8, overflow: 'hidden' }}
      initialRegion={{
        latitude: 5.602,
        longitude: -0.174,
        latitudeDelta: 0.12,
        longitudeDelta: 0.12
      }}
    >
      <Marker coordinate={pickup} title="Pickup" />
      <Marker coordinate={dropoff} title="Drop-off" />
      {latestPoint ? <Marker coordinate={latestPoint} title="Rider" pinColor={theme.colors.primary} /> : null}
      <Polyline coordinates={routePoints} strokeColor={theme.colors.primary} strokeWidth={4} />
    </MapView>
  );
}

export function TrackingScreen({ route }: Props) {
  const [riderPoint, setRiderPoint] = useState<Coordinate | null>(null);
  const { data: delivery } = useQuery({
    queryKey: ['delivery', route.params.deliveryId],
    queryFn: () => apiRequest<DeliveryDetail>(`/deliveries/${route.params.deliveryId}`)
  });

  useEffect(() => {
    let cleanup: () => void = () => undefined;

    createRealtimeClient().then((socket) => {
      socket.emit('delivery:join', route.params.deliveryId);
      socket.on(realtimeEvents.trackingPoint, (point) => {
        setRiderPoint({ latitude: Number(point.latitude), longitude: Number(point.longitude) });
      });
      cleanup = () => {
        socket.disconnect();
      };
    });

    return () => cleanup();
  }, [route.params.deliveryId]);

  const pickup = {
    latitude: Number(delivery?.pickupLatitude ?? 5.6508),
    longitude: Number(delivery?.pickupLongitude ?? -0.1668)
  };
  const dropoff = {
    latitude: Number(delivery?.dropoffLatitude ?? 5.556),
    longitude: Number(delivery?.dropoffLongitude ?? -0.1824)
  };
  const latestPoint = riderPoint ?? delivery?.trackingPoints?.[0]
    ? {
        latitude: Number((riderPoint ?? delivery?.trackingPoints?.[0])?.latitude),
        longitude: Number((riderPoint ?? delivery?.trackingPoints?.[0])?.longitude)
      }
    : null;
  const routePoints = delivery?.metadata?.expectedRoute?.polyline?.length
    ? delivery.metadata.expectedRoute.polyline
    : latestPoint
      ? [pickup, latestPoint, dropoff]
      : [pickup, dropoff];
  const rider = delivery?.assignments?.[0]?.riderProfile;

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, gap: 12 }}>
        <View style={{ gap: 8 }}>
          <StatusPill label="Rider assigned" tone="success" />
          <Text style={{ fontSize: 24, fontWeight: '900', color: theme.colors.ink }}>Live delivery tracking</Text>
          <Text style={{ color: theme.colors.muted }}>OTP verification and proof of delivery protect both sides.</Text>
        </View>

        <LazyMap pickup={pickup} dropoff={dropoff} latestPoint={latestPoint} routePoints={routePoints} />

        <View style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 14, gap: 10 }}>
          <Text style={{ fontWeight: '900', color: theme.colors.ink }}>{rider?.user?.fullName ?? 'Rider'} is on the way</Text>
          <Text style={{ color: theme.colors.muted }}>
            {[rider?.vehicle?.type, rider?.vehicle?.plateNumber].filter(Boolean).join(' ') || 'Vehicle details pending'}. Delivery OTP: 4821
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button label="Call" icon={<Phone size={18} color="#fff" />} onPress={() => undefined} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Emergency" icon={<ShieldCheck size={18} color={theme.colors.ink} />} onPress={() => undefined} variant="secondary" />
            </View>
          </View>
        </View>
      </View>
    </Screen>
  );
}
