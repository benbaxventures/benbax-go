import { useMemo, useState } from 'react';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { Bike, CalendarClock, CreditCard, PackageCheck } from 'lucide-react-native';
import { Alert, Pressable, Text, View } from 'react-native';
import type { DeliveryCategory } from '@benbax/shared';
import { Button } from '../components/Button';
import { LocationInput } from '../components/LocationInput';
import { Screen } from '../components/Screen';
import { useCreateDelivery, useDeliveryQuote } from '../hooks/useDeliveries';
import { useInitializePayment } from '../hooks/usePayments';
import { useDeliveryStore } from '../store/deliveryStore';
import { theme } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

const categories: Array<{ key: DeliveryCategory; label: string }> = [
  { key: 'PARCEL', label: 'Parcel' },
  { key: 'FOOD', label: 'Food' },
  { key: 'COURIER', label: 'Courier' },
  { key: 'PHARMACY', label: 'Pharmacy' }
];

export function HomeScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { draft, setCategory, setPickup, setDropoff, setQuote } = useDeliveryStore();
  const quoteMutation = useDeliveryQuote();
  const createMutation = useCreateDelivery();
  const initializePayment = useInitializePayment();
  const [pickupText, setPickupText] = useState('East Legon, Accra');
  const [dropoffText, setDropoffText] = useState('Osu Oxford Street');
  const [pickupLandmark, setPickupLandmark] = useState('Near A&C Mall');
  const [dropoffLandmark, setDropoffLandmark] = useState('Near Papaye');

  const pickup = useMemo(
    () => ({
      label: pickupText,
      latitude: 5.6508,
      longitude: -0.1668,
      landmark: pickupLandmark
    }),
    [pickupLandmark, pickupText]
  );

  const dropoff = useMemo(
    () => ({
      label: dropoffText,
      latitude: 5.556,
      longitude: -0.1824,
      landmark: dropoffLandmark
    }),
    [dropoffLandmark, dropoffText]
  );

  async function quote() {
    setPickup(pickup);
    setDropoff(dropoff);
    const result = await quoteMutation.mutateAsync({ category: draft.category, pickup, dropoff });
    setQuote(result);
  }

  async function createDelivery() {
    try {
      const delivery = await createMutation.mutateAsync({
        category: draft.category,
        pickup,
        dropoff,
        paymentMethod: 'PAYSTACK_CARD'
      });
      const initialized = await initializePayment.mutateAsync({
        deliveryId: delivery.id,
        method: 'PAYSTACK_CARD'
      });

      if (initialized.checkout) {
        navigation.navigate('PaymentCheckout', {
          deliveryId: delivery.id,
          authorizationUrl: initialized.checkout.authorizationUrl,
          reference: initialized.checkout.reference
        });
        return;
      }

      navigation.navigate('Tracking', { deliveryId: delivery.id });
    } catch (error) {
      Alert.alert('Could not start payment', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 28, fontWeight: '900', color: theme.colors.ink }}>Send anything safely</Text>
        <Text style={{ color: theme.colors.muted, fontSize: 15 }}>Smart pickup, landmarks, rider dispatch, and live proof.</Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {categories.map((item) => {
          const selected = item.key === draft.category;
          return (
            <Pressable
              key={item.key}
              onPress={() => setCategory(item.key)}
              style={{
                minHeight: 44,
                paddingHorizontal: 14,
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                borderColor: theme.colors.border,
                borderWidth: selected ? 0 : 1
              }}
            >
              <Text style={{ color: selected ? '#fff' : theme.colors.ink, fontWeight: '700' }}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <LocationInput
        label="Pickup"
        value={pickupText}
        placeholder="Search pickup"
        onChangeText={setPickupText}
        landmark={pickupLandmark}
        onChangeLandmark={setPickupLandmark}
      />
      <LocationInput
        label="Drop-off"
        value={dropoffText}
        placeholder="Search drop-off"
        onChangeText={setDropoffText}
        landmark={dropoffLandmark}
        onChangeLandmark={setDropoffLandmark}
      />

      <View style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 14, gap: 12, ...theme.shadow }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Bike size={19} color={theme.colors.primary} />
          <Text style={{ fontWeight: '800', color: theme.colors.ink }}>Smart dispatch preview</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: theme.colors.muted }}>ETA</Text>
          <Text style={{ color: theme.colors.ink, fontWeight: '800' }}>{draft.quote?.estimatedMinutes ?? '--'} mins</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: theme.colors.muted }}>Estimated fare</Text>
          <Text style={{ color: theme.colors.ink, fontWeight: '900' }}>GHS {draft.quote?.total ?? '--'}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button label="Quote" icon={<CreditCard size={18} color="#fff" />} onPress={quote} loading={quoteMutation.isPending} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label="Book"
            icon={<PackageCheck size={18} color="#fff" />}
            onPress={createDelivery}
            loading={createMutation.isPending || initializePayment.isPending}
          />
        </View>
      </View>

      <Button label="Schedule delivery" icon={<CalendarClock size={18} color={theme.colors.ink} />} onPress={quote} variant="secondary" />
    </Screen>
  );
}
