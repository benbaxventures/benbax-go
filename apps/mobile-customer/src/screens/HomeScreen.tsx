import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { Bike, CalendarClock, CreditCard, Crosshair, PackageCheck, Car } from 'lucide-react-native';
import { Alert, Pressable, Text, View } from 'react-native';
import type { DeliveryCategory } from '../shared';
import { Button } from '../components/Button';
import { LocationInput } from '../components/LocationInput';
import { Screen } from '../components/Screen';
import { useCreateDelivery, useDeliveryQuote } from '../hooks/useDeliveries';
import { useRideQuote, useCreateRide } from '../hooks/useRides';
import { useInitializePayment } from '../hooks/usePayments';
import { useCurrentLocation } from '../hooks/useCurrentLocation';
import { useDeliveryStore } from '../store/deliveryStore';
import { useRideStore } from '../store/rideStore';
import { theme } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

type Mode = 'delivery' | 'ride';

const categories: Array<{ key: DeliveryCategory; label: string }> = [
  { key: 'PARCEL', label: 'Parcel' },
  { key: 'FOOD', label: 'Food' },
  { key: 'COURIER', label: 'Courier' },
  { key: 'PHARMACY', label: 'Pharmacy' }
];

const vehicleTypes = [
  { key: 'ECONOMY', label: 'Economy', multiplier: '1x' },
  { key: 'COMFORT', label: 'Comfort', multiplier: '1.25x' },
  { key: 'SUV', label: 'SUV', multiplier: '1.45x' }
];

export function HomeScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [mode, setMode] = useState<Mode>('delivery');

  const deliveryStore = useDeliveryStore();
  const rideStore = useRideStore();

  const deliveryQuoteMutation = useDeliveryQuote();
  const createDeliveryMutation = useCreateDelivery();
  const rideQuoteMutation = useRideQuote();
  const createRideMutation = useCreateRide();
  const initializePayment = useInitializePayment();

  const { latitude, longitude, loading: locationLoading, requestLocation } = useCurrentLocation();

  const [pickupText, setPickupText] = useState('East Legon, Accra');
  const [dropoffText, setDropoffText] = useState('Osu Oxford Street');
  const [pickupLandmark, setPickupLandmark] = useState('Near A&C Mall');
  const [dropoffLandmark, setDropoffLandmark] = useState('Near Papaye');

  const currentPickupLatitude = pickupText === 'Current location' ? latitude : 5.6508;
  const currentPickupLongitude = pickupText === 'Current location' ? longitude : -0.1668;

  const handleUseLocation = useCallback(async () => {
    await requestLocation();
    setPickupText('Current location');
  }, [requestLocation]);

  useEffect(() => {
    if (pickupText === 'Current location' && latitude && longitude) {
      const point = { label: 'Current location', latitude, longitude, landmark: pickupLandmark };
      deliveryStore.setPickup(point);
      rideStore.setPickup(point);
    }
  }, [latitude, longitude, pickupText, pickupLandmark]);

  const pickup = useMemo(
    () => ({
      label: pickupText,
      latitude: currentPickupLatitude,
      longitude: currentPickupLongitude,
      landmark: pickupLandmark
    }),
    [pickupText, currentPickupLatitude, currentPickupLongitude, pickupLandmark]
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

  async function handleQuote() {
    deliveryStore.setPickup(pickup);
    deliveryStore.setDropoff(dropoff);
    rideStore.setPickup(pickup);
    rideStore.setDropoff(dropoff);

    if (mode === 'delivery') {
      const result = await deliveryQuoteMutation.mutateAsync({ category: deliveryStore.draft.category, pickup, dropoff });
      deliveryStore.setQuote(result);
    } else {
      const result = await rideQuoteMutation.mutateAsync({ pickup, dropoff, requestedVehicleType: rideStore.draft.vehicleType });
      rideStore.setQuote(result);
    }
  }

  async function handleBook() {
    try {
      if (mode === 'delivery') {
        const delivery = await createDeliveryMutation.mutateAsync({
          category: deliveryStore.draft.category,
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
      } else {
        const ride = await createRideMutation.mutateAsync({
          pickup,
          dropoff,
          requestedVehicleType: rideStore.draft.vehicleType
        });
        Alert.alert('Ride requested', `Trip ${ride.tripCode} created. Looking for a nearby driver.`);
      }
    } catch (error) {
      Alert.alert('Could not complete request', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  const quoteLoading = deliveryQuoteMutation.isPending || rideQuoteMutation.isPending;
  const bookLoading = createDeliveryMutation.isPending || createRideMutation.isPending || initializePayment.isPending;

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 28, fontWeight: '900', color: theme.colors.ink }}>
          {mode === 'delivery' ? 'Send anything safely' : 'Go anywhere, anytime'}
        </Text>
        <Text style={{ color: theme.colors.muted, fontSize: 15 }}>
          {mode === 'delivery' ? 'Smart pickup, landmarks, rider dispatch, and live proof.' : 'Quick ride matching, clear fares, and real-time tracking.'}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', backgroundColor: theme.colors.surface, borderRadius: 8, padding: 3, borderWidth: 1, borderColor: theme.colors.border }}>
        <Pressable
          onPress={() => setMode('delivery')}
          style={{
            flex: 1, paddingVertical: 10, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
            backgroundColor: mode === 'delivery' ? theme.colors.primary : 'transparent'
          }}
        >
          <Text style={{ fontWeight: '800', color: mode === 'delivery' ? '#fff' : theme.colors.ink }}>Delivery</Text>
        </Pressable>
        <Pressable
          onPress={() => setMode('ride')}
          style={{
            flex: 1, paddingVertical: 10, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
            backgroundColor: mode === 'ride' ? theme.colors.primary : 'transparent'
          }}
        >
          <Text style={{ fontWeight: '800', color: mode === 'ride' ? '#fff' : theme.colors.ink }}>Ride</Text>
        </Pressable>

        <Pressable
          onPress={handleUseLocation}
          style={{
            paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6,
            flexDirection: 'row', alignItems: 'center', gap: 4,
            backgroundColor: theme.colors.surface
          }}
        >
          <Crosshair size={14} color={theme.colors.primary} />
          <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
            {locationLoading ? 'Detecting...' : latitude && longitude ? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` : 'Use my location'}
          </Text>
        </Pressable>
      </View>

      {mode === 'delivery' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {categories.map((item) => {
            const selected = item.key === deliveryStore.draft.category;
            return (
              <Pressable
                key={item.key}
                onPress={() => deliveryStore.setCategory(item.key)}
                style={{
                  minHeight: 44, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                  borderColor: theme.colors.border, borderWidth: selected ? 0 : 1
                }}
              >
                <Text style={{ color: selected ? '#fff' : theme.colors.ink, fontWeight: '700' }}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {vehicleTypes.map((vt) => {
            const selected = vt.key === rideStore.draft.vehicleType;
            return (
              <Pressable
                key={vt.key}
                onPress={() => rideStore.setVehicleType(vt.key)}
                style={{
                  flex: 1, minHeight: 60, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                  borderColor: theme.colors.border, borderWidth: selected ? 0 : 1
                }}
              >
                <Text style={{ color: selected ? '#fff' : theme.colors.ink, fontWeight: '800' }}>{vt.label}</Text>
                <Text style={{ color: selected ? '#D7FFF5' : theme.colors.muted, fontSize: 12 }}>{vt.multiplier}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

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
          {mode === 'delivery' ? <Bike size={19} color={theme.colors.primary} /> : <Car size={19} color={theme.colors.primary} />}
          <Text style={{ fontWeight: '800', color: theme.colors.ink }}>
            {mode === 'delivery' ? 'Delivery preview' : 'Ride preview'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: theme.colors.muted }}>ETA</Text>
          <Text style={{ color: theme.colors.ink, fontWeight: '800' }}>
            {mode === 'delivery'
              ? (deliveryStore.draft.quote?.estimatedMinutes ?? '--')
              : (rideStore.draft.quote?.estimatedMinutes ?? '--')} mins
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: theme.colors.muted }}>Estimated fare</Text>
          <Text style={{ color: theme.colors.ink, fontWeight: '900' }}>
            GHS {mode === 'delivery'
              ? (deliveryStore.draft.quote?.total ?? '--')
              : (rideStore.draft.quote?.total ?? '--')}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button label="Quote" icon={<CreditCard size={18} color="#fff" />} onPress={handleQuote} loading={quoteLoading} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label="Book"
            icon={mode === 'delivery' ? <PackageCheck size={18} color="#fff" /> : <Car size={18} color="#fff" />}
            onPress={handleBook}
            loading={bookLoading}
          />
        </View>
      </View>

      <Button
        label={mode === 'delivery' ? 'Schedule delivery' : 'Schedule ride'}
        icon={<CalendarClock size={18} color={theme.colors.ink} />}
        onPress={handleQuote}
        variant="secondary"
      />
    </Screen>
  );
}
