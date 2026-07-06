import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Clock, MessageSquareText, Navigation, Phone } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
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
      user?: { fullName?: string; phone?: string };
      vehicle?: { type?: string; plateNumber?: string | null };
    };
  }>;
};

type Props = NativeStackScreenProps<RootStackParamList, 'Tracking'>;

export function TrackingScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [riderPoint, setRiderPoint] = useState<Coordinate | null>(null);

  const { data: delivery, isLoading } = useQuery({
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
      cleanup = () => {
        socket.disconnect();
      };
    });

    return () => cleanup();
  }, [route.params.deliveryId]);

  const pickup = {
    latitude: Number(delivery?.pickupLatitude ?? 5.6508),
    longitude: Number(delivery?.pickupLongitude ?? -0.1668),
  };
  const dropoff = {
    latitude: Number(delivery?.dropoffLatitude ?? 5.556),
    longitude: Number(delivery?.dropoffLongitude ?? -0.1824),
  };
  const latestPoint: Coordinate | null =
    riderPoint ??
    (delivery?.trackingPoints?.[0]
      ? {
          latitude: Number(delivery.trackingPoints[0].latitude),
          longitude: Number(delivery.trackingPoints[0].longitude),
        }
      : null);
  const routePoints = delivery?.metadata?.expectedRoute?.polyline?.length
    ? delivery.metadata.expectedRoute.polyline
    : latestPoint
      ? [pickup, latestPoint, dropoff]
      : [pickup, dropoff];
  const rider = delivery?.assignments?.[0]?.riderProfile;

  const estimatedRegion = latestPoint
    ? {
        latitude: latestPoint.latitude,
        longitude: latestPoint.longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      }
    : {
        latitude: (pickup.latitude + dropoff.latitude) / 2,
        longitude: (pickup.longitude + dropoff.longitude) / 2,
        latitudeDelta: 0.12,
        longitudeDelta: 0.12,
      };

  function openDriverMap() {
    if (!latestPoint) return;
    const query = `${latestPoint.latitude},${latestPoint.longitude}`;
    Alert.alert('Open in Maps', 'View rider location in Google Maps?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Open',
        onPress: () => {
          Linking.openURL(
            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
          ).catch(() => {});
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
        <MapMarker coordinate={pickup} title="Pickup" pinColor={theme.colors.primary} />
        <MapMarker coordinate={dropoff} title="Drop-off" pinColor="#EF4444" />
        {latestPoint ? (
          <MapMarker
            coordinate={latestPoint}
            title="Rider"
            pinColor={theme.colors.accent}
            zIndex={10}
          />
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

      {/* === BOTTOM INFO CARD (glass-morphism style) === */}
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
        {/* Status */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <StatusPill label="Live tracking" tone="success" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Clock size={14} color={theme.colors.muted} />
            <Text style={{ fontSize: 13, color: theme.colors.muted }}>
              ETA ~{delivery?.metadata?.expectedRoute?.polyline ? '12' : '--'} min
            </Text>
          </View>
        </View>

        {/* Rider info */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: theme.colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff' }}>
              {(rider?.user?.fullName ?? 'R')[0]}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: theme.colors.ink }}>
              {rider?.user?.fullName ?? 'Finding a rider...'}
            </Text>
            <Text style={{ fontSize: 13, color: theme.colors.muted, marginTop: 2 }}>
              {[rider?.vehicle?.type, rider?.vehicle?.plateNumber].filter(Boolean).join(' · ') ||
                'Delivery rider'}
            </Text>
          </View>
        </View>

        {/* Location summary */}
        <View style={{ gap: 8, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: theme.colors.primary,
              }}
            />
            <Text style={{ fontSize: 13, color: theme.colors.ink }} numberOfLines={1}>
              {delivery?.pickupLatitude
                ? `${Number(delivery.pickupLatitude).toFixed(4)}, ${Number(delivery.pickupLongitude).toFixed(4)}`
                : 'Pickup location'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />
            <Text style={{ fontSize: 13, color: theme.colors.ink }} numberOfLines={1}>
              {delivery?.dropoffLatitude
                ? `${Number(delivery.dropoffLatitude).toFixed(4)}, ${Number(delivery.dropoffLongitude).toFixed(4)}`
                : 'Drop-off location'}
            </Text>
          </View>
        </View>

        {/* Action buttons */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button
              label="Call"
              icon={<Phone size={18} color="#fff" />}
              onPress={() => callPhone(rider?.user?.phone ?? BENBAX_PHONE)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="WhatsApp"
              icon={<MessageSquareText size={18} color={theme.colors.ink} />}
              onPress={() => openWhatsApp(rider?.user?.phone ?? BENBAX_PHONE)}
              variant="secondary"
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
