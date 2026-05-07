import { useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Phone, ShieldCheck } from 'lucide-react-native';
import { Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { realtimeEvents } from '@benbax/shared';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { StatusPill } from '../components/StatusPill';
import { createRealtimeClient } from '../services/realtime';
import { theme } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Tracking'>;

const pickup = { latitude: 5.6508, longitude: -0.1668 };
const dropoff = { latitude: 5.556, longitude: -0.1824 };

export function TrackingScreen({ route }: Props) {
  const [riderPoint, setRiderPoint] = useState({ latitude: 5.612, longitude: -0.173 });

  useEffect(() => {
    let cleanup = () => undefined;

    createRealtimeClient().then((socket) => {
      socket.emit('delivery:join', route.params.deliveryId);
      socket.on(realtimeEvents.trackingPoint, (point) => {
        setRiderPoint({ latitude: Number(point.latitude), longitude: Number(point.longitude) });
      });
      cleanup = () => socket.disconnect();
    });

    return () => cleanup();
  }, [route.params.deliveryId]);

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, gap: 12 }}>
        <View style={{ gap: 8 }}>
          <StatusPill label="Rider assigned" tone="success" />
          <Text style={{ fontSize: 24, fontWeight: '900', color: theme.colors.ink }}>Live delivery tracking</Text>
          <Text style={{ color: theme.colors.muted }}>OTP verification and proof of delivery protect both sides.</Text>
        </View>

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
          <Marker coordinate={riderPoint} title="Rider" pinColor={theme.colors.primary} />
          <Polyline coordinates={[pickup, riderPoint, dropoff]} strokeColor={theme.colors.primary} strokeWidth={4} />
        </MapView>

        <View style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 14, gap: 10 }}>
          <Text style={{ fontWeight: '900', color: theme.colors.ink }}>Kofi is 8 mins away</Text>
          <Text style={{ color: theme.colors.muted }}>Bike AA-4521-26. Delivery OTP: 4821</Text>
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
