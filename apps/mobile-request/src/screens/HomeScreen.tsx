import type { NavigationProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import {
  ArrowRight,
  Bike,
  CalendarClock,
  Car,
  ChevronDown,
  Clock,
  CreditCard,
  Navigation,
  PackageCheck,
  Search,
  Star,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { MapMarker, MapView } from '../components/MapView';
import { useCurrentLocation } from '../hooks/useCurrentLocation';
import { useCreateDelivery, useDeliveryQuote } from '../hooks/useDeliveries';
import { useInitializePayment } from '../hooks/usePayments';
import { useCreateTrip, useTripQuote } from '../hooks/useTrips';
import type { RootStackParamList } from '../navigation/types';
import type { AddressPoint, DeliveryCategory } from '../shared';
import { useDeliveryStore } from '../store/deliveryStore';
import { useTripStore } from '../store/tripStore';
import { theme } from '../theme/tokens';

const PANEL_MIN_HEIGHT = 200;
const PANEL_FORM_HEIGHT = 500;

type Mode = 'delivery' | 'rides';

const categories: Array<{ key: DeliveryCategory; label: string; icon: string }> = [
  { key: 'PARCEL', label: 'Parcel', icon: '📦' },
  { key: 'FOOD', label: 'Food', icon: '🍔' },
  { key: 'COURIER', label: 'Courier', icon: '📬' },
  { key: 'PHARMACY', label: 'Pharmacy', icon: '💊' },
];

const vehicleTypes = [
  { key: 'ECONOMY', label: 'Economy', multiplier: '1x', icon: '🚗' },
  { key: 'COMFORT', label: 'Comfort', multiplier: '1.25x', icon: '🚙' },
  { key: 'SUV', label: 'SUV', multiplier: '1.45x', icon: '🚐' },
];

const suggestedLocations = [
  {
    name: 'Afienya Toll Booth',
    description: 'Greater Accra Region, Prampram',
    lat: 5.7,
    lng: -0.15,
    icon: '🏢',
  },
  {
    name: 'Tetteh Quashie Interchange',
    description: 'City of Accra',
    lat: 5.598,
    lng: -0.167,
    icon: '🏗️',
  },
  {
    name: 'Kotoka Terminal 3',
    description: 'Kotoka International Airport',
    lat: 5.605,
    lng: -0.167,
    icon: '✈️',
  },
];

function ServiceCard({
  icon,
  label,
  subtitle,
  onPress,
  isSelected,
}: {
  icon: React.ReactNode;
  label: string;
  subtitle: string;
  onPress: () => void;
  isSelected: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: isSelected ? theme.colors.primary : '#fff',
        borderRadius: 16,
        paddingVertical: 20,
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: isSelected ? theme.colors.primary : theme.colors.border,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      }}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : theme.colors.surfaceMuted,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 10,
        }}
      >
        {icon}
      </View>
      <Text
        style={{
          fontSize: 16,
          fontWeight: '800',
          color: isSelected ? '#fff' : theme.colors.ink,
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 12,
          color: isSelected ? 'rgba(255,255,255,0.75)' : theme.colors.muted,
          textAlign: 'center',
          marginTop: 2,
        }}
      >
        {subtitle}
      </Text>
    </Pressable>
  );
}

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  // --- Panel animation ---
  const [_panelExpanded, setPanelExpanded] = useState(false); // eslint-disable-line @typescript-eslint/no-unused-vars
  const panelAnim = useRef(new Animated.Value(0)).current;
  const mapPaddingAnim = useRef(new Animated.Value(PANEL_MIN_HEIGHT)).current;

  const togglePanel = useCallback(
    (expand: boolean) => {
      setPanelExpanded(expand);
      Animated.spring(panelAnim, {
        toValue: expand ? 1 : 0,
        useNativeDriver: false,
        tension: 80,
        friction: 12,
      }).start();
      Animated.timing(mapPaddingAnim, {
        toValue: expand ? PANEL_FORM_HEIGHT : PANEL_MIN_HEIGHT,
        duration: 250,
        useNativeDriver: false,
      }).start();
    },
    [panelAnim, mapPaddingAnim]
  );

  // --- Mode and form state ---
  const [mode, setMode] = useState<Mode>('delivery');

  const setDeliveryPickup = useDeliveryStore((s) => s.setPickup);
  const setTripPickup = useTripStore((s) => s.setPickup);
  const setDeliveryCategory = useDeliveryStore((s) => s.setCategory);
  const deliveryCategory = useDeliveryStore((s) => s.draft.category);
  const setDeliveryQuote = useDeliveryStore((s) => s.setQuote);
  const setDeliveryDropoff = useDeliveryStore((s) => s.setDropoff);
  const setTripQuote = useTripStore((s) => s.setQuote);
  const setTripDropoff = useTripStore((s) => s.setDropoff);
  const setTripVehicleType = useTripStore((s) => s.setVehicleType);
  const tripVehicleType = useTripStore((s) => s.draft.vehicleType);
  const tripQuote = useTripStore((s) => s.draft.quote);
  const deliveryQuote = useDeliveryStore((s) => s.draft.quote);

  const deliveryQuoteMutation = useDeliveryQuote();
  const createDeliveryMutation = useCreateDelivery();
  const tripQuoteMutation = useTripQuote();
  const createTripMutation = useCreateTrip();
  const initializePayment = useInitializePayment();

  const {
    latitude,
    longitude,
    label: detectedLocationLabel,
    address: detectedAddress,
    nearbyName,
    requestLocation,
  } = useCurrentLocation();

  const [pickupText, setPickupText] = useState('Current location');
  const [dropoffText, setDropoffText] = useState('');
  const [pickupLandmark, setPickupLandmark] = useState('');
  const [dropoffLandmark] = useState('');
  const [showForm, setShowForm] = useState(false);

  const usingDetectedPickup =
    pickupText === 'Current location' || pickupText === detectedLocationLabel;
  const hasLocation = latitude !== null && longitude !== null;
  const currentLat = usingDetectedPickup && hasLocation ? latitude : 5.6508;
  const currentLng = usingDetectedPickup && hasLocation ? longitude : -0.1668;

  const handleUseLocation = useCallback(() => {
    setPickupText('Current location');
    requestLocation();
  }, [requestLocation]);

  useEffect(() => {
    if (!hasLocation || !detectedLocationLabel) return;
    if (pickupText === 'Current location') {
      setPickupText(detectedLocationLabel);
    }
    if (nearbyName && !pickupLandmark) {
      setPickupLandmark(`Near ${nearbyName}`);
    }
  }, [hasLocation, detectedLocationLabel, nearbyName, pickupLandmark, pickupText]);

  // Sync location to stores
  useEffect(() => {
    if (
      hasLocation &&
      (pickupText === 'Current location' || pickupText === detectedLocationLabel)
    ) {
      const point: AddressPoint = {
        label: detectedLocationLabel ?? 'Current location',
        ...(detectedAddress ? { formattedAddress: detectedAddress } : {}),
        latitude,
        longitude,
        landmark: (nearbyName ?? pickupLandmark) || 'Near you',
      };
      setDeliveryPickup(point);
      setTripPickup(point);
    }
  }, [
    detectedAddress,
    detectedLocationLabel,
    setDeliveryPickup,
    latitude,
    longitude,
    nearbyName,
    pickupLandmark,
    pickupText,
    setTripPickup,
    hasLocation,
  ]);

  const pickup = useMemo(
    (): AddressPoint => ({
      label: pickupText,
      ...(usingDetectedPickup && detectedAddress ? { formattedAddress: detectedAddress } : {}),
      latitude: currentLat,
      longitude: currentLng,
      landmark: pickupLandmark || 'Near you',
    }),
    [currentLat, currentLng, detectedAddress, pickupLandmark, pickupText, usingDetectedPickup]
  );

  const dropoff = useMemo(
    () => ({
      label: dropoffText || 'Destination',
      latitude: 5.556,
      longitude: -0.1824,
      landmark: dropoffLandmark,
    }),
    [dropoffLandmark, dropoffText]
  );

  async function handleQuote() {
    setDeliveryPickup(pickup);
    setDeliveryDropoff(dropoff);
    setTripPickup(pickup);
    setTripDropoff(dropoff);

    if (mode === 'delivery') {
      const result = await deliveryQuoteMutation.mutateAsync({
        category: deliveryCategory,
        pickup,
        dropoff,
      });
      setDeliveryQuote(result);
    } else {
      const result = await tripQuoteMutation.mutateAsync({
        pickup,
        dropoff,
        requestedVehicleType: tripVehicleType,
      });
      setTripQuote(result);
    }
  }

  async function handleBook() {
    try {
      if (mode === 'delivery') {
        const delivery = await createDeliveryMutation.mutateAsync({
          category: deliveryCategory,
          pickup,
          dropoff,
          paymentMethod: 'PAYSTACK_CARD',
        });
        const initialized = await initializePayment.mutateAsync({
          deliveryId: delivery.id,
          method: 'PAYSTACK_CARD',
        });
        if (initialized.checkout) {
          navigation.navigate('PaymentCheckout', {
            deliveryId: delivery.id,
            authorizationUrl: initialized.checkout.authorizationUrl,
            reference: initialized.checkout.reference,
          });
          return;
        }
        navigation.navigate('Tracking', { deliveryId: delivery.id });
      } else {
        const carTrip = await createTripMutation.mutateAsync({
          pickup,
          dropoff,
          requestedVehicleType: tripVehicleType,
        });
        navigation.navigate('TripTracking', { tripId: carTrip.id });
      }
    } catch (error) {
      Alert.alert(
        'Could not complete request',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  }

  async function handleSchedule() {
    const scheduledFor = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    try {
      if (mode === 'delivery') {
        const delivery = await createDeliveryMutation.mutateAsync({
          category: deliveryCategory,
          pickup,
          dropoff,
          paymentMethod: 'PAYSTACK_CARD',
          scheduledFor,
        });
        Alert.alert(
          'Delivery scheduled',
          'Your delivery is scheduled for about 30 minutes from now.'
        );
        navigation.navigate('Tracking', { deliveryId: delivery.id });
      } else {
        const carTrip = await createTripMutation.mutateAsync({
          pickup,
          dropoff,
          requestedVehicleType: tripVehicleType,
          scheduledFor,
        });
        Alert.alert('Ride scheduled', 'Your ride is scheduled for about 30 minutes from now.');
        navigation.navigate('TripTracking', { tripId: carTrip.id });
      }
    } catch (error) {
      Alert.alert(
        'Could not schedule request',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  }

  const quoteLoading = deliveryQuoteMutation.isPending || tripQuoteMutation.isPending;
  const bookLoading =
    createDeliveryMutation.isPending || createTripMutation.isPending || initializePayment.isPending;

  // --- Panel transform ---
  const panelTranslateY = panelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [PANEL_MIN_HEIGHT - PANEL_FORM_HEIGHT, 0],
  });
  const headerOpacity = panelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  const handleWhereTo = useCallback(() => {
    togglePanel(true);
    setShowForm(true);
  }, [togglePanel]);

  const handleModeSelect = useCallback(
    (newMode: Mode) => {
      setMode(newMode);
      togglePanel(true);
      setShowForm(true);
    },
    [togglePanel]
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      {/* === FULL-SCREEN MAP === */}
      <View style={{ ...StyleSheet.absoluteFillObject }}>
        <MapView
          initialRegion={{
            latitude: currentLat,
            longitude: currentLng,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          showsUserLocation
          showsMyLocationButton={false}
          style={{ flex: 1 }}
          padding={{ top: 0, right: 0, bottom: PANEL_FORM_HEIGHT, left: 0 }}
        >
          {/* Dropoff marker if set */}
          {dropoffText ? (
            <MapMarker
              coordinate={{ latitude: 5.556, longitude: -0.1824 }}
              title="Destination"
              pinColor={theme.colors.accent}
            />
          ) : null}
        </MapView>
      </View>

      {/* === TOP FLOATING HEADER (logo + where-to bar) === */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          opacity: headerOpacity,
        }}
      >
        {/* Brand row */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: '#fff',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOpacity: 0.12,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 2 },
                elevation: 4,
              }}
            >
              <Image
                source={require('../../assets/logo.png') as number} // eslint-disable-line @typescript-eslint/no-require-imports
                style={{ width: 28, height: 28, borderRadius: 6 }}
                resizeMode="contain"
              />
            </View>
            <Text
              style={{
                fontSize: 20,
                fontWeight: '900',
                color: '#fff',
                textShadowColor: 'rgba(0,0,0,0.3)',
                textShadowRadius: 4,
              }}
            >
              BENBAX
            </Text>
          </View>
        </View>

        {/* "Where to?" search bar */}
        <Pressable
          onPress={handleWhereTo}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#fff',
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 14,
            gap: 12,
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 5,
          }}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: theme.colors.primary,
            }}
          />
          <Text style={{ flex: 1, fontSize: 16, color: theme.colors.muted, fontWeight: '500' }}>
            {pickupText !== 'Current location' ? pickupText : 'Where to?'}
          </Text>
          <View
            style={{
              backgroundColor: theme.colors.surfaceMuted,
              borderRadius: 8,
              padding: 6,
            }}
          >
            <Search size={18} color={theme.colors.muted} />
          </View>
        </Pressable>
      </Animated.View>

      {/* === BOTTOM PANEL === */}
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: PANEL_FORM_HEIGHT,
          transform: [{ translateY: panelTranslateY }],
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: '#fff',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: -4 },
            elevation: 10,
            overflow: 'hidden',
          }}
        >
          {/* Drag Handle */}
          <View style={{ alignItems: 'center', paddingVertical: 10 }}>
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.colors.border,
              }}
            />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }}
            keyboardShouldPersistTaps="handled"
          >
            {!showForm ? (
              <>
                {/* === COMPACT MODE SELECTOR === */}
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: '900',
                    color: theme.colors.ink,
                    marginBottom: 16,
                  }}
                >
                  What do you need?
                </Text>

                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
                  <ServiceCard
                    icon={
                      <Bike size={26} color={mode === 'delivery' ? '#fff' : theme.colors.primary} />
                    }
                    label="Delivery"
                    subtitle="Fast & secure"
                    onPress={() => handleModeSelect('delivery')}
                    isSelected={mode === 'delivery'}
                  />
                  <ServiceCard
                    icon={
                      <Car size={26} color={mode === 'rides' ? '#fff' : theme.colors.primary} />
                    }
                    label="Rides"
                    subtitle="Anywhere"
                    onPress={() => handleModeSelect('rides')}
                    isSelected={mode === 'rides'}
                  />
                </View>

                {/* Suggested locations */}
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '700',
                    color: theme.colors.ink,
                    marginBottom: 12,
                  }}
                >
                  Suggested locations
                </Text>
                {suggestedLocations.map((location, index) => (
                  <Pressable
                    key={index}
                    onPress={() => {
                      setDropoffText(location.name);
                      handleWhereTo();
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 12,
                      paddingHorizontal: 4,
                      borderBottomWidth: index < suggestedLocations.length - 1 ? 1 : 0,
                      borderBottomColor: theme.colors.border,
                      gap: 14,
                    }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        backgroundColor: theme.colors.surfaceMuted,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 18 }}>{location.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.ink }}>
                        {location.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: theme.colors.muted, marginTop: 1 }}>
                        {location.description}
                      </Text>
                    </View>
                    <ArrowRight size={18} color={theme.colors.muted} />
                  </Pressable>
                ))}

                {/* Promotional banner */}
                <View
                  style={{
                    marginTop: 20,
                    backgroundColor: theme.colors.primary,
                    borderRadius: 16,
                    padding: 18,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      backgroundColor: 'rgba(255,255,255,0.2)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Star size={22} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>
                      THE GAME GOES ON
                    </Text>
                    <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
                      Keep the football vibes alive
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              <>
                {/* === BOOKING FORM === */}
                {/* Back arrow */}
                <Pressable
                  onPress={() => {
                    togglePanel(false);
                    setShowForm(false);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 16,
                  }}
                >
                  <ChevronDown size={22} color={theme.colors.ink} />
                  <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.ink }}>
                    {mode === 'delivery' ? 'Send a package' : 'Book a ride'}
                  </Text>
                </Pressable>

                {/* Pickup / Dropoff inputs */}
                <View
                  style={{
                    backgroundColor: theme.colors.surfaceMuted,
                    borderRadius: 14,
                    padding: 4,
                    marginBottom: 16,
                  }}
                >
                  {/* Pickup */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      gap: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: theme.colors.primary,
                      }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: theme.colors.muted }}>
                        PICKUP
                      </Text>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.ink }}>
                        {pickupText}
                      </Text>
                    </View>
                    <Pressable onPress={handleUseLocation} style={{ padding: 4 }}>
                      <Navigation size={18} color={theme.colors.primary} />
                    </Pressable>
                  </View>

                  <View
                    style={{ height: 1, backgroundColor: theme.colors.border, marginLeft: 44 }}
                  />

                  {/* Dropoff */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      gap: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: '#EF4444',
                      }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: theme.colors.muted }}>
                        DROPOFF
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View
                          style={{
                            flex: 1,
                            borderBottomWidth: 1,
                            borderBottomColor: 'transparent',
                          }}
                        >
                          <TextInput
                            style={{
                              fontSize: 15,
                              fontWeight: '600',
                              color: theme.colors.ink,
                              backgroundColor: 'transparent',
                              padding: 0,
                              margin: 0,
                            }}
                            placeholder="Enter destination"
                            placeholderTextColor={theme.colors.muted}
                            value={dropoffText}
                            onChangeText={setDropoffText}
                          />
                        </View>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Vehicle / Category selection */}
                {mode === 'delivery' ? (
                  <View style={{ marginBottom: 16 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: theme.colors.muted,
                        marginBottom: 10,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      Category
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 8 }}
                    >
                      {categories.map((item) => {
                        const selected = item.key === deliveryCategory;
                        return (
                          <Pressable
                            key={item.key}
                            onPress={() => setDeliveryCategory(item.key)}
                            style={{
                              paddingHorizontal: 16,
                              paddingVertical: 10,
                              borderRadius: 10,
                              backgroundColor: selected
                                ? theme.colors.primary
                                : theme.colors.surfaceMuted,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <Text style={{ fontSize: 16 }}>{item.icon}</Text>
                            <Text
                              style={{
                                color: selected ? '#fff' : theme.colors.ink,
                                fontWeight: '700',
                                fontSize: 14,
                              }}
                            >
                              {item.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : (
                  <View style={{ marginBottom: 16 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: theme.colors.muted,
                        marginBottom: 10,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      Select vehicle
                    </Text>
                    {vehicleTypes.map((vt) => {
                      const selected = vt.key === tripVehicleType;
                      return (
                        <Pressable
                          key={vt.key}
                          onPress={() => setTripVehicleType(vt.key)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: 14,
                            paddingHorizontal: 16,
                            borderRadius: 12,
                            backgroundColor: selected
                              ? theme.colors.primary
                              : theme.colors.surfaceMuted,
                            marginBottom: 8,
                            gap: 14,
                          }}
                        >
                          <Text style={{ fontSize: 24 }}>{vt.icon}</Text>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                fontWeight: '800',
                                color: selected ? '#fff' : theme.colors.ink,
                                fontSize: 16,
                              }}
                            >
                              {vt.label}
                            </Text>
                            <Text
                              style={{
                                fontSize: 12,
                                color: selected ? 'rgba(255,255,255,0.7)' : theme.colors.muted,
                              }}
                            >
                              {vt.multiplier} multiplier
                            </Text>
                          </View>
                          <Text
                            style={{
                              fontWeight: '700',
                              color: selected ? '#fff' : theme.colors.ink,
                              fontSize: 14,
                            }}
                          >
                            ~{4 + vehicleTypes.indexOf(vt)} min
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {/* Price Preview Card */}
                <View
                  style={{
                    backgroundColor: theme.colors.surfaceMuted,
                    borderRadius: 14,
                    padding: 16,
                    gap: 10,
                    marginBottom: 16,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {mode === 'delivery' ? (
                      <Bike size={18} color={theme.colors.primary} />
                    ) : (
                      <Car size={18} color={theme.colors.primary} />
                    )}
                    <Text style={{ fontWeight: '800', color: theme.colors.ink, fontSize: 15 }}>
                      Trip preview
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Clock size={14} color={theme.colors.muted} />
                      <Text style={{ color: theme.colors.muted, fontSize: 14 }}>ETA</Text>
                    </View>
                    <Text style={{ color: theme.colors.ink, fontWeight: '800', fontSize: 14 }}>
                      {mode === 'delivery'
                        ? (deliveryQuote?.estimatedMinutes ?? '--')
                        : (tripQuote?.estimatedMinutes ?? '--')}{' '}
                      mins
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: theme.colors.muted, fontSize: 14 }}>Estimated fare</Text>
                    <Text style={{ color: theme.colors.ink, fontWeight: '900', fontSize: 18 }}>
                      GHS{' '}
                      {mode === 'delivery'
                        ? (deliveryQuote?.total ?? '--')
                        : (tripQuote?.total ?? '--')}
                    </Text>
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Get quote"
                      icon={<CreditCard size={18} color="#fff" />}
                      onPress={handleQuote}
                      loading={quoteLoading}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Book now"
                      icon={
                        mode === 'delivery' ? (
                          <PackageCheck size={18} color="#fff" />
                        ) : (
                          <Car size={18} color="#fff" />
                        )
                      }
                      onPress={handleBook}
                      loading={bookLoading}
                    />
                  </View>
                </View>

                <Button
                  label={mode === 'delivery' ? 'Schedule delivery' : 'Schedule ride'}
                  icon={<CalendarClock size={18} color={theme.colors.ink} />}
                  onPress={handleSchedule}
                  loading={bookLoading}
                  variant="secondary"
                />
              </>
            )}
          </ScrollView>
        </View>
      </Animated.View>

      {/* === FLOATING LOCATION BUTTON === */}
      <Pressable
        onPress={handleUseLocation}
        style={{
          position: 'absolute',
          right: 16,
          bottom: PANEL_FORM_HEIGHT + 24,
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: '#fff',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 4,
        }}
      >
        <Navigation size={20} color={theme.colors.primary} />
      </Pressable>
    </View>
  );
}
