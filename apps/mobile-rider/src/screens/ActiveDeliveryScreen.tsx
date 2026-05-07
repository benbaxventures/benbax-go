import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Camera, CheckCircle2, Navigation } from 'lucide-react-native';
import { Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { useRiderLocation } from '../hooks/useRiderLocation';
import { theme } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveDelivery'>;

const pickup = { latitude: 5.6508, longitude: -0.1668 };
const rider = { latitude: 5.612, longitude: -0.173 };
const dropoff = { latitude: 5.556, longitude: -0.1824 };
const routePoints = [pickup, rider, dropoff];

export function ActiveDeliveryScreen({ route }: Props) {
  useRiderLocation(route.params.deliveryId, true);

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, gap: 12 }}>
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 24, fontWeight: '900', color: theme.colors.ink }}>Active delivery</Text>
          <Text style={{ color: theme.colors.muted }}>Route guidance, live GPS, OTP, and proof capture.</Text>
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
          <Polyline coordinates={routePoints} strokeColor={theme.colors.primary} strokeWidth={4} />
        </MapView>
        <View style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 14, gap: 10 }}>
          <Text style={{ color: theme.colors.ink, fontWeight: '900' }}>OTP required at delivery</Text>
          <Text style={{ color: theme.colors.muted }}>Ask customer for OTP before marking complete.</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button label="Navigate" icon={<Navigation size={18} color="#fff" />} onPress={() => undefined} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Proof" icon={<Camera size={18} color={theme.colors.ink} />} onPress={() => undefined} variant="secondary" />
            </View>
          </View>
          <Button label="Complete delivery" icon={<CheckCircle2 size={18} color="#fff" />} onPress={() => undefined} />
        </View>
      </View>
    </Screen>
  );
}
