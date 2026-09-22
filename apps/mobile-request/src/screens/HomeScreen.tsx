import type { NavigationProp } from '@react-navigation/native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import {
  ArrowRight,
  Bike,
  CalendarClock,
  Car,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  MapPin as MapPinIcon,
  Navigation,
  PackageCheck,
  Search,
  Star,
} from 'lucide-react-native';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { DriversOnlineSheet } from '../components/DriversOnlineSheet';
import { MapPinLabel } from '../components/MapPinLabel';
import { MapMarker, MapView } from '../components/MapView';
import { useClientPresence } from '../hooks/useClientPresence';
import { useCurrentLocation } from '../hooks/useCurrentLocation';
import { useCreateDelivery, useDeliveryQuote } from '../hooks/useDeliveries';
import {
  distanceKmBetween,
  formatDriverDistance,
  useNearbyDrivers,
  type NearbyDriver,
} from '../hooks/useNearbyDrivers';
import { useNearbyDriversRealtime } from '../hooks/useNearbyDriversRealtime';
import { useInitializePayment } from '../hooks/usePayments';
import { useCreateTrip, useTripQuote } from '../hooks/useTrips';
import type { RootStackParamList } from '../navigation/types';
import {
  geocodePlace,
  resolvePlaceId,
  reverseGeocodePoint,
  suggestPlaces,
  type GeoPoint,
  type PlaceSuggestion,
} from '../services/geocoding';
import { RESOLVING_PLACE_LABEL } from '../services/placeName';
import type { AddressPoint, DeliveryCategory } from '../shared';
import { useAuthStore } from '../store/authStore';
import { useDeliveryStore } from '../store/deliveryStore';
import { useTripStore } from '../store/tripStore';
import { theme } from '../theme/tokens';

const PANEL_MIN_HEIGHT = 200;
const PANEL_FORM_HEIGHT = 500;

// Central Accra — used only until the device location or a chosen place resolves.
const FALLBACK_COORD: GeoPoint = { latitude: 5.6508, longitude: -0.1668 };

type Mode = 'delivery' | 'rides';

const categories: Array<{ key: DeliveryCategory; label: string; icon: string }> = [
  { key: 'PARCEL', label: 'Parcel', icon: '📦' },
  { key: 'FOOD', label: 'Food', icon: '🍔' },
  { key: 'COURIER', label: 'Courier', icon: '📬' },
  { key: 'PHARMACY', label: 'Pharmacy', icon: '💊' },
];

const vehicleTypes = [
  { key: 'ECONOMY', label: 'Economy', multiplier: '1x', icon: '🚗' },
  { key: 'MOTO', label: 'Moto', multiplier: '1x', icon: '🏍️' },
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

/** Distance shown next to a driver. Measured, never floored to look tidy. */
const formatDriverKm = formatDriverDistance;

const NearbyDriverMarker = memo(function NearbyDriverMarker({ driver }: { driver: NearbyDriver }) {
  return (
    <MapMarker
      coordinate={{ latitude: driver.latitude, longitude: driver.longitude }}
      title={driver.name ? `${driver.name} · online` : 'Available driver'}
      description={`${formatDriverKm(driver.distanceKm)} away`}
      pinColor="#2563EB"
      zIndex={2}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: '#2563EB',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 2,
          borderColor: '#fff',
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 1 },
          elevation: 3,
        }}
      >
        <Car size={15} color="#fff" />
      </View>
    </MapMarker>
  );
});

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();

  // --- Panel animation ---
  const panelAnim = useRef(new Animated.Value(0)).current;

  const togglePanel = useCallback(
    (expand: boolean) => {
      Animated.spring(panelAnim, {
        toValue: expand ? 1 : 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
    },
    [panelAnim]
  );

  // --- Mode and form state ---
  const [mode, setMode] = useState<Mode>('delivery');

  const deliveryCategory = useDeliveryStore((s) => s.draft.category);
  const deliveryQuote = useDeliveryStore((s) => s.draft.quote);
  const setDeliveryCategory = useDeliveryStore((s) => s.setCategory);
  const setDeliveryPickup = useDeliveryStore((s) => s.setPickup);
  const setDeliveryDropoff = useDeliveryStore((s) => s.setDropoff);
  const setDeliveryQuote = useDeliveryStore((s) => s.setQuote);
  const vehicleType = useTripStore((s) => s.draft.vehicleType);
  const tripQuote = useTripStore((s) => s.draft.quote);
  const setVehicleType = useTripStore((s) => s.setVehicleType);
  const setTripPickup = useTripStore((s) => s.setPickup);
  const setTripDropoff = useTripStore((s) => s.setDropoff);
  const setTripQuote = useTripStore((s) => s.setQuote);
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
    resolvingPlace,
    permissionDenied: locationPermissionDenied,
    errorType: locationErrorType,
    requestLocation,
  } = useCurrentLocation();

  // Announce this passenger's live location to the server so nearby online
  // drivers see them on the dispatch map while they're browsing for a ride.
  const currentUserName = useAuthStore((s) => s.user?.name);
  const { approachingDriver, dismissApproachingDriver } = useClientPresence({
    enabled: true,
    latitude,
    longitude,
    ...(currentUserName ? { name: currentUserName } : {}),
  });
  // Real-time driver stream via Socket.IO (primary), REST polling as fallback.
  // Both come from the server's live presence registry, so only drivers whose
  // app is actually connected are counted — never stale "online" DB rows.
  //
  // Gated on focus: this screen stays mounted behind the other tabs, and there
  // is no reason to stream every driver's movement while the passenger is in
  // their wallet. Presence above is deliberately *not* gated — drivers should
  // keep seeing this passenger wherever they are in the app — and both share
  // one socket, so the connection survives the tab switch either way.
  const { drivers: realtimeDrivers, live: realtimeLive } = useNearbyDriversRealtime(isFocused, {
    latitude,
    longitude,
  });
  const { data: polledDrivers = [], isLoading: polledLoading } = useNearbyDrivers(
    latitude,
    longitude,
    isFocused,
    realtimeLive
  );

  // Once the live snapshot has arrived it is the truth, even when empty; the
  // poll only fills in while the socket is (re)connecting. The REST records
  // also carry the detail the position stream doesn't (vehicle, rating,
  // availability), so they're merged onto the live positions rather than
  // discarded — one source of drivers, two levels of detail.
  const onlineDrivers = useMemo(() => {
    if (!realtimeLive) return polledDrivers;
    if (polledDrivers.length === 0) return realtimeDrivers;
    const detailById = new Map(polledDrivers.map((driver) => [driver.id, driver]));
    return realtimeDrivers.map((driver) => {
      const detail = detailById.get(driver.id);
      if (!detail) return driver;
      // Live position wins. Everything else comes from the REST record unless
      // the stream actually carries it — a plain spread would let the stream's
      // `vehicleType: null` erase the vehicle the REST call just told us about.
      return {
        ...detail,
        latitude: driver.latitude,
        longitude: driver.longitude,
        distanceKm: driver.distanceKm,
        ...(driver.vehicleType ? { vehicleType: driver.vehicleType } : {}),
        ...(driver.name ? { name: driver.name } : {}),
        ...(driver.since ? { since: driver.since } : {}),
        ...(driver.heading != null ? { heading: driver.heading } : {}),
      };
    });
  }, [realtimeLive, realtimeDrivers, polledDrivers]);
  const driversLoading = !realtimeLive && polledLoading;

  const [pickupText, setPickupText] = useState('Current location');
  /**
   * True while the pickup is "wherever the passenger is" rather than a place
   * they typed or picked. Tracked explicitly instead of comparing the pickup
   * text to the detected label — that label legitimately changes as the name
   * resolves and as they move.
   */
  const [pickupIsDetected, setPickupIsDetected] = useState(true);
  const [driversSheetOpen, setDriversSheetOpen] = useState(false);
  const [dropoffText, setDropoffText] = useState('');
  const [pickupLandmark, setPickupLandmark] = useState('');
  const [pickupFormatted, setPickupFormatted] = useState<string | null>(null);
  const [dropoffFormatted, setDropoffFormatted] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Live place suggestions while typing a pickup/dropoff.
  const [suggestionField, setSuggestionField] = useState<'pickup' | 'dropoff' | null>(null);
  const [pickupSuggestions, setPickupSuggestions] = useState<PlaceSuggestion[]>([]);
  const [dropoffSuggestions, setDropoffSuggestions] = useState<PlaceSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);

  // Resolved coordinates for each end of the trip. `pickupCoord` is an override
  // set when the customer types/picks a named pickup; when null we fall back to
  // the detected device location. `dropoffCoord` is null until a destination is
  // resolved. `resolvingField` drives the inline "locating" spinner.
  const [pickupCoord, setPickupCoord] = useState<GeoPoint | null>(null);
  const [dropoffCoord, setDropoffCoord] = useState<GeoPoint | null>(null);
  const [resolvingField, setResolvingField] = useState<'pickup' | 'dropoff' | null>(null);
  const mapRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const hasLocation = latitude !== null && longitude !== null;
  const detectedCoord: GeoPoint | null = hasLocation ? { latitude, longitude } : null;
  const usingDetectedPickup = !pickupCoord && pickupIsDetected;
  const activePickupCoord = pickupCoord ?? detectedCoord ?? FALLBACK_COORD;
  /** The pickup name, or null while it is still being looked up. */
  const pickupDisplayName =
    pickupText && pickupText !== 'Current location' && pickupText !== RESOLVING_PLACE_LABEL
      ? pickupText
      : null;

  // Distances from the pickup, nearest first. Deduplicated by id so one
  // driver can never be counted twice.
  const nearbyDrivers = useMemo(() => {
    const byId = new Map<string, NearbyDriver>();
    for (const driver of onlineDrivers) {
      byId.set(driver.id, {
        ...driver,
        distanceKm: distanceKmBetween(activePickupCoord, driver),
      });
    }
    return [...byId.values()].sort((a, b) => a.distanceKm - b.distanceKm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineDrivers, activePickupCoord.latitude, activePickupCoord.longitude]);
  const nearestDriverKm = nearbyDrivers[0]?.distanceKm;

  // Fit map to show all nearby driver markers.
  const fitMapToDrivers = useCallback(() => {
    const map = mapRef.current;
    if (!map || nearbyDrivers.length === 0) return;
    if (typeof map.fitToCoordinates !== 'function') return;
    const coords = nearbyDrivers.map((d) => ({ latitude: d.latitude, longitude: d.longitude }));
    coords.push(activePickupCoord);
    map.fitToCoordinates(coords, {
      edgePadding: { top: 140, right: 60, bottom: PANEL_FORM_HEIGHT + 40, left: 60 },
      animated: true,
    });
  }, [nearbyDrivers, activePickupCoord]);

  // Centre the map on one driver picked from the list.
  const focusDriver = useCallback((driver: NearbyDriver) => {
    const map = mapRef.current;
    if (!map || typeof map.animateToRegion !== 'function') return;
    map.animateToRegion(
      {
        latitude: driver.latitude,
        longitude: driver.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      600
    );
  }, []);

  const currentLat = activePickupCoord.latitude;
  const currentLng = activePickupCoord.longitude;

  const handleUseLocation = useCallback(() => {
    setPickupCoord(null);
    setPickupFormatted(null);
    setPickupText('Current location');
    setPickupIsDetected(true);
    requestLocation();
  }, [requestLocation]);

  // Resolve a typed place name into coordinates and move the map there.
  const resolvePlace = useCallback(async (field: 'pickup' | 'dropoff', text: string) => {
    const query = text.trim();
    if (query.length < 3) return;
    setResolvingField(field);
    const result = await geocodePlace(query);
    setResolvingField(null);
    if (!result) {
      Alert.alert(
        'Location not found',
        `We couldn't locate "${query}". Try a nearby landmark or pick a suggestion.`
      );
      return;
    }
    const coord: GeoPoint = { latitude: result.latitude, longitude: result.longitude };
    if (field === 'pickup') {
      setPickupText(result.label || query);
      setPickupFormatted(result.formattedAddress ?? null);
      setPickupCoord(coord);
      setPickupIsDetected(false);
    } else {
      setDropoffText(result.label || query);
      setDropoffFormatted(result.formattedAddress ?? null);
      setDropoffCoord(coord);
    }
  }, []);

  // Tapping the map places the destination at that spot and reverse-geocodes it
  // to a readable name (street or nearby landmark) so the marker never shows a
  // bare pin. Only active inside the booking form.
  const handleMapPress = useCallback(
    async (lat: number, lng: number) => {
      if (!showForm) return;
      setResolvingField('dropoff');
      const info = await reverseGeocodePoint(lat, lng);
      setResolvingField(null);
      const label = info?.label ?? 'Dropped pin';
      setDropoffText(label);
      setDropoffFormatted(info?.formattedAddress ?? null);
      setDropoffCoord({ latitude: lat, longitude: lng });
    },
    [showForm]
  );

  // Debounced live suggestions: fetch nearby places while the customer types.
  useEffect(() => {
    if (!showForm || !suggestionField) return;
    const text = suggestionField === 'pickup' ? pickupText : dropoffText;
    const set = suggestionField === 'pickup' ? setPickupSuggestions : setDropoffSuggestions;
    const clear = suggestionField === 'pickup' ? setDropoffSuggestions : setPickupSuggestions;

    const timer = setTimeout(async () => {
      if (text.trim().length < 3) {
        set([]);
        setSuggestionError(null);
        return;
      }
      setSuggestionsLoading(true);
      setSuggestionError(null);
      try {
        const results = await suggestPlaces(text);
        set(results);
        clear([]);
        if (results.length === 0) {
          setSuggestionError(null);
        }
      } catch {
        set([]);
        setSuggestionError('Could not load suggestions. Try typing more or press search.');
      } finally {
        setSuggestionsLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [showForm, suggestionField, pickupText, dropoffText]);

  const closeSuggestions = useCallback(() => {
    setSuggestionField(null);
    setPickupSuggestions([]);
    setDropoffSuggestions([]);
    setSuggestionError(null);
  }, []);

  // Pick a suggestion: resolve its exact coordinates + real name.
  const selectSuggestion = useCallback(
    async (field: 'pickup' | 'dropoff', suggestion: PlaceSuggestion) => {
      setResolvingField(field);
      const result = await resolvePlaceId(suggestion.placeId);
      setResolvingField(null);
      if (!result) {
        // Fall back to a plain geocode of the description so the flow still works.
        await resolvePlace(field, suggestion.description);
        closeSuggestions();
        return;
      }
      const coord: GeoPoint = { latitude: result.latitude, longitude: result.longitude };
      if (field === 'pickup') {
        setPickupText(suggestion.description);
        setPickupFormatted(result.formattedAddress ?? null);
        setPickupCoord(coord);
        setPickupIsDetected(false);
      } else {
        setDropoffText(suggestion.description);
        setDropoffFormatted(result.formattedAddress ?? null);
        setDropoffCoord(coord);
      }
      closeSuggestions();
    },
    [closeSuggestions, resolvePlace]
  );

  // Fill the active field with the user's own device location.
  const applyCurrentLocation = useCallback(
    (field: 'pickup' | 'dropoff') => {
      if (!hasLocation) {
        requestLocation();
        closeSuggestions();
        return;
      }
      if (field === 'pickup') {
        handleUseLocation();
      } else {
        setDropoffText(detectedLocationLabel ?? 'Current location');
        setDropoffFormatted(detectedAddress ?? null);
        setDropoffCoord({ latitude, longitude });
      }
      closeSuggestions();
    },
    [
      closeSuggestions,
      detectedAddress,
      detectedLocationLabel,
      handleUseLocation,
      hasLocation,
      latitude,
      longitude,
      requestLocation,
    ]
  );

  // Keep the pickup field showing the resolved name of where the passenger
  // actually is — "Finding your location…" first, then e.g. "Church of
  // Pentecost, Golf Estate", and updated again if they move somewhere new.
  // Stops the moment they type their own pickup.
  useEffect(() => {
    if (!hasLocation || !pickupIsDetected || !detectedLocationLabel) return;
    setPickupText((prev) => (prev === detectedLocationLabel ? prev : detectedLocationLabel));
    setPickupLandmark(nearbyName ? `Near ${nearbyName}` : '');
  }, [hasLocation, detectedLocationLabel, nearbyName, pickupIsDetected]);

  // Sync location to stores. Only the coordinates are load-bearing here — the
  // label is what the passenger and their driver read.
  useEffect(() => {
    if (!hasLocation || !pickupIsDetected) return;
    const point: AddressPoint = {
      // Never persist the "Finding your location…" placeholder onto a trip —
      // the driver would read it as the pickup name.
      label:
        detectedLocationLabel && detectedLocationLabel !== RESOLVING_PLACE_LABEL
          ? detectedLocationLabel
          : (detectedAddress ?? 'Current location'),
      ...(detectedAddress ? { formattedAddress: detectedAddress } : {}),
      latitude,
      longitude,
      landmark: (nearbyName ?? pickupLandmark) || 'Near you',
    };
    setDeliveryPickup(point);
    setTripPickup(point);
  }, [
    detectedAddress,
    detectedLocationLabel,
    setDeliveryPickup,
    latitude,
    longitude,
    nearbyName,
    pickupLandmark,
    pickupIsDetected,
    setTripPickup,
    hasLocation,
  ]);

  const pickup = useMemo((): AddressPoint => {
    const formattedAddress = pickupFormatted ?? (usingDetectedPickup ? detectedAddress : undefined);
    return {
      // The booking itself runs on the coordinates below; this label is only
      // what the passenger and their driver read, so it must never be the
      // in-progress placeholder.
      label: pickupDisplayName ?? formattedAddress ?? 'Current location',
      ...(formattedAddress ? { formattedAddress } : {}),
      latitude: currentLat,
      longitude: currentLng,
      landmark:
        pickupLandmark || (usingDetectedPickup && nearbyName ? `Near ${nearbyName}` : 'Near you'),
    };
  }, [
    currentLat,
    currentLng,
    detectedAddress,
    pickupFormatted,
    pickupLandmark,
    pickupDisplayName,
    usingDetectedPickup,
    nearbyName,
  ]);

  // Keep the map framed on the trip in realtime: fit both points once a
  // destination is chosen, otherwise centre on the pickup.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (dropoffCoord && typeof map.fitToCoordinates === 'function') {
      map.fitToCoordinates([activePickupCoord, dropoffCoord], {
        edgePadding: { top: 120, right: 60, bottom: PANEL_FORM_HEIGHT + 40, left: 60 },
        animated: true,
      });
    } else if (typeof map.animateToRegion === 'function') {
      map.animateToRegion(
        {
          latitude: activePickupCoord.latitude,
          longitude: activePickupCoord.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        },
        600
      );
    }
    // Depend on primitive lat/lng (not the coord object, which is recreated
    // every render) so this only fires when the location actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePickupCoord.latitude, activePickupCoord.longitude, dropoffCoord]);

  // Guarantee we have destination coordinates before quoting/booking: if the
  // customer typed a name but never submitted it, resolve it now.
  const ensureDropoffResolved = useCallback(async (): Promise<AddressPoint | null> => {
    if (dropoffCoord) {
      return {
        label: dropoffText || 'Destination',
        latitude: dropoffCoord.latitude,
        longitude: dropoffCoord.longitude,
        ...(dropoffFormatted ? { formattedAddress: dropoffFormatted } : {}),
        ...(dropoffText || dropoffFormatted
          ? { landmark: dropoffText || dropoffFormatted || '' }
          : {}),
      };
    }
    const query = dropoffText.trim();
    if (!query) return null;
    setResolvingField('dropoff');
    const result = await geocodePlace(query);
    setResolvingField(null);
    if (!result) return null;
    const coord: GeoPoint = { latitude: result.latitude, longitude: result.longitude };
    setDropoffText(result.label || query);
    setDropoffFormatted(result.formattedAddress ?? null);
    setDropoffCoord(coord);
    return {
      label: result.label || query,
      latitude: coord.latitude,
      longitude: coord.longitude,
      ...(result.formattedAddress ? { formattedAddress: result.formattedAddress } : {}),
      landmark: result.label || query,
    };
  }, [dropoffCoord, dropoffText, dropoffFormatted]);

  // Compute the fare/ETA quote behind the scenes once both ends are resolved.
  // Used by the "Get quote" button and by the auto-quote effect below.
  const runQuote = useCallback(async (): Promise<boolean> => {
    const resolvedDropoff = await ensureDropoffResolved();
    if (!resolvedDropoff) return false;

    setDeliveryPickup(pickup);
    setDeliveryDropoff(resolvedDropoff);
    setTripPickup(pickup);
    setTripDropoff(resolvedDropoff);

    if (mode === 'delivery') {
      const result = await deliveryQuoteMutation.mutateAsync({
        category: deliveryCategory,
        pickup,
        dropoff: resolvedDropoff,
      });
      setDeliveryQuote(result);
    } else {
      const result = await tripQuoteMutation.mutateAsync({
        pickup,
        dropoff: resolvedDropoff,
        requestedVehicleType: vehicleType,
      });
      setTripQuote(result);
    }
    return true;
  }, [
    deliveryQuoteMutation,
    ensureDropoffResolved,
    mode,
    pickup,
    tripQuoteMutation,
    deliveryCategory,
    setDeliveryDropoff,
    setDeliveryPickup,
    setDeliveryQuote,
    setTripDropoff,
    setTripPickup,
    setTripQuote,
    vehicleType,
  ]);

  // Auto-quote: whenever the destination resolves and the booking form is open,
  // refresh the fare/ETA preview automatically so the math happens in the
  // background. Gated on primitive coords so typing text doesn't spam requests.
  useEffect(() => {
    if (!showForm || !dropoffCoord) return;
    let cancelled = false;
    (async () => {
      try {
        if (!cancelled) await runQuote();
      } catch {
        // Background quote refresh only — never surface an error for this.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm, dropoffCoord, mode, pickup.latitude, pickup.longitude]);

  async function handleQuote() {
    closeSuggestions();
    const resolvedDropoff = await ensureDropoffResolved();
    if (!resolvedDropoff) {
      Alert.alert('Add a destination', 'Enter or pick where the package is going.');
      return;
    }

    await runQuote();
  }

  async function handleBook() {
    try {
      closeSuggestions();
      const resolvedDropoff = await ensureDropoffResolved();
      if (!resolvedDropoff) {
        Alert.alert('Add a destination', 'Enter or pick where the package is going.');
        return;
      }
      if (mode === 'delivery') {
        const delivery = await createDeliveryMutation.mutateAsync({
          category: deliveryCategory,
          pickup,
          dropoff: resolvedDropoff,
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
          dropoff: resolvedDropoff,
          requestedVehicleType: vehicleType,
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
      closeSuggestions();
      const resolvedDropoff = await ensureDropoffResolved();
      if (!resolvedDropoff) {
        Alert.alert('Add a destination', 'Enter or pick where the package is going.');
        return;
      }
      if (mode === 'delivery') {
        const delivery = await createDeliveryMutation.mutateAsync({
          category: deliveryCategory,
          pickup,
          dropoff: resolvedDropoff,
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
          dropoff: resolvedDropoff,
          requestedVehicleType: vehicleType,
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

  const handleBackToHome = useCallback(() => {
    closeSuggestions();
    setShowForm(false);
    togglePanel(false);
  }, [closeSuggestions, togglePanel]);

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
          mapRef={mapRef}
          onPress={handleMapPress}
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
          <MapMarker
            coordinate={activePickupCoord}
            title={pickupDisplayName ?? 'Pickup'}
            description={pickupFormatted ?? pickupDisplayName ?? 'Pickup'}
            pinColor={theme.colors.primary}
            anchor={{ x: 0.5, y: 1 }}
          >
            <MapPinLabel color={theme.colors.primary} title="Pickup" subtitle={pickupDisplayName} />
          </MapMarker>
          {nearbyDrivers.map((driver) => (
            <NearbyDriverMarker key={driver.id} driver={driver} />
          ))}
          {approachingDriver?.latitude != null && approachingDriver.longitude != null ? (
            <MapMarker
              coordinate={{
                latitude: approachingDriver.latitude,
                longitude: approachingDriver.longitude,
              }}
              anchor={{ x: 0.5, y: 1 }}
              zIndex={5}
            >
              <MapPinLabel color="#F59E0B" title="Driver" subtitle="Heading to you" />
            </MapMarker>
          ) : null}
          {!usingDetectedPickup && detectedCoord ? (
            <MapMarker coordinate={detectedCoord} anchor={{ x: 0.5, y: 1 }} zIndex={1}>
              <MapPinLabel
                color="#2563EB"
                title="Current location"
                subtitle={detectedLocationLabel}
              />
            </MapMarker>
          ) : null}
          {dropoffCoord ? (
            <MapMarker
              coordinate={dropoffCoord}
              title={dropoffText || 'Destination'}
              description={dropoffFormatted ?? dropoffText ?? 'Destination'}
              pinColor="#EF4444"
            >
              <MapPinLabel color="#EF4444" title="Dropoff" subtitle={dropoffText} />
            </MapMarker>
          ) : null}
        </MapView>
      </View>

      {/* === DRIVER HEADING TO THIS PASSENGER === */}
      {approachingDriver ? (
        <Pressable
          onPress={dismissApproachingDriver}
          accessibilityRole="button"
          accessibilityLabel="A driver is heading to you. Tap to dismiss."
          style={{
            position: 'absolute',
            top: insets.top + 156,
            left: 16,
            right: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: theme.colors.ink,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 10,
            zIndex: 20,
            elevation: 6,
          }}
        >
          <Car size={18} color="#F59E0B" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
              A Benbax driver is heading to you
            </Text>
            <Text style={{ color: '#D1D5DB', fontSize: 12 }}>
              {approachingDriver.etaSeconds != null
                ? `About ${Math.max(1, Math.ceil(approachingDriver.etaSeconds / 60))} min away · `
                : ''}
              Book a ride to lock them in
            </Text>
          </View>
        </Pressable>
      ) : null}

      {/* === DRIVERS NEARBY INDICATOR === */}
      {driversLoading ? (
        <View
          accessibilityLabel="Finding nearby drivers"
          style={{
            position: 'absolute',
            top: insets.top + 116,
            alignSelf: 'center',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: 'rgba(255,255,255,0.94)',
            borderRadius: 18,
            paddingHorizontal: 12,
            paddingVertical: 7,
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            elevation: 4,
          }}
        >
          <ActivityIndicator size="small" color="#2563EB" />
          <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: '600' }}>
            Finding nearby drivers…
          </Text>
        </View>
      ) : nearbyDrivers.length > 0 ? (
        <Pressable
          onPress={() => setDriversSheetOpen(true)}
          accessibilityRole="button"
          accessibilityHint="Opens the list of every driver online right now"
          accessibilityLabel={`${nearbyDrivers.length} ${nearbyDrivers.length === 1 ? 'driver' : 'drivers'} online${
            nearestDriverKm != null ? `, nearest ${formatDriverKm(nearestDriverKm)} away` : ''
          }. Tap to see them all.`}
          hitSlop={8}
          style={({ pressed }) => ({
            position: 'absolute',
            top: insets.top + 116,
            alignSelf: 'center',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: pressed ? '#F1F5F9' : 'rgba(255,255,255,0.94)',
            borderRadius: 18,
            paddingLeft: 12,
            paddingRight: 8,
            paddingVertical: 7,
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            elevation: 4,
          })}
        >
          <Car size={15} color="#2563EB" />
          <Text style={{ color: theme.colors.ink, fontSize: 12, fontWeight: '800' }}>
            {nearbyDrivers.length} {nearbyDrivers.length === 1 ? 'driver' : 'drivers'} online
            {nearestDriverKm != null && Number.isFinite(nearestDriverKm)
              ? ` · nearest ${formatDriverKm(nearestDriverKm)}`
              : ''}
          </Text>
          <ChevronRight size={15} color={theme.colors.muted} />
        </Pressable>
      ) : (
        <Pressable
          onPress={() => setDriversSheetOpen(true)}
          accessibilityRole="button"
          accessibilityHint="Opens the driver list, which updates as drivers come online"
          accessibilityLabel="No drivers available nearby. Tap for details."
          hitSlop={8}
          style={({ pressed }) => ({
            position: 'absolute',
            top: insets.top + 116,
            alignSelf: 'center',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: pressed ? '#F1F5F9' : 'rgba(255,255,255,0.88)',
            borderRadius: 18,
            paddingLeft: 12,
            paddingRight: 8,
            paddingVertical: 7,
            elevation: 2,
          })}
        >
          <Car size={15} color={theme.colors.muted} />
          <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: '700' }}>
            No drivers available nearby
          </Text>
          <ChevronRight size={15} color={theme.colors.muted} />
        </Pressable>
      )}

      {/* === ALL ONLINE DRIVERS === */}
      <DriversOnlineSheet
        visible={driversSheetOpen}
        onClose={() => setDriversSheetOpen(false)}
        drivers={nearbyDrivers}
        live={realtimeLive}
        onShowOnMap={fitMapToDrivers}
        onFocusDriver={focusDriver}
      />

      {/* === LOCATION PERMISSION / GPS === */}
      {/* Never fake a position: say what's wrong and offer the one tap that
          fixes it. Booking still works by typing a pickup. */}
      {locationPermissionDenied || locationErrorType === 'services_disabled' ? (
        <Pressable
          onPress={requestLocation}
          accessibilityRole="button"
          accessibilityLabel={
            locationPermissionDenied
              ? 'Location permission is off. Tap to allow location access.'
              : 'Device location is turned off. Tap to try again.'
          }
          style={{
            position: 'absolute',
            // Stack below the "driver heading to you" banner when both show.
            top: insets.top + (approachingDriver ? 216 : 156),
            left: 16,
            right: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: '#FEF3C7',
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 10,
            zIndex: 20,
            elevation: 6,
          }}
        >
          <MapPinIcon size={18} color="#B45309" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#7C2D12', fontWeight: '800', fontSize: 13 }}>
              {locationPermissionDenied
                ? 'Location access is off'
                : 'Device location is turned off'}
            </Text>
            <Text style={{ color: '#92400E', fontSize: 12 }}>
              {locationPermissionDenied
                ? 'Allow location so we can set your pickup — or type it below.'
                : 'Turn on location services, then tap here to retry.'}
            </Text>
          </View>
          <ChevronRight size={16} color="#B45309" />
        </Pressable>
      ) : null}

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
                source={require('../../assets/benbax-logo.png') as number} // eslint-disable-line @typescript-eslint/no-require-imports
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
            {pickupDisplayName ?? 'Where to?'}
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
                      setDropoffFormatted(location.description);
                      setDropoffCoord({ latitude: location.lat, longitude: location.lng });
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
                {/* Return to the compact home panel. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back to home"
                  hitSlop={8}
                  onPress={handleBackToHome}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 16,
                  }}
                >
                  <ChevronLeft size={22} color={theme.colors.ink} />
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
                      <TextInput
                        style={{
                          fontSize: 15,
                          fontWeight: '600',
                          color: theme.colors.ink,
                          padding: 0,
                          margin: 0,
                        }}
                        placeholder="Pickup location"
                        placeholderTextColor={theme.colors.muted}
                        value={pickupText}
                        onChangeText={(text) => {
                          setPickupText(text);
                          setPickupCoord(null);
                          setPickupFormatted(null);
                          // They're choosing their own pickup now — stop
                          // overwriting the field with the detected place.
                          setPickupIsDetected(false);
                        }}
                        onFocus={() => setSuggestionField('pickup')}
                        onSubmitEditing={() => resolvePlace('pickup', pickupText)}
                        returnKeyType="search"
                      />
                    </View>
                    {resolvingField === 'pickup' || (pickupIsDetected && resolvingPlace) ? (
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                    ) : null}
                    <Pressable
                      onPress={handleUseLocation}
                      accessibilityRole="button"
                      accessibilityLabel="Use my current location as the pickup"
                      hitSlop={8}
                      style={{ padding: 4 }}
                    >
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
                            onChangeText={(text) => {
                              setDropoffText(text);
                              setDropoffCoord(null);
                              setDropoffFormatted(null);
                            }}
                            onFocus={() => setSuggestionField('dropoff')}
                            onSubmitEditing={() => resolvePlace('dropoff', dropoffText)}
                            returnKeyType="search"
                          />
                        </View>
                        {resolvingField === 'dropoff' ? (
                          <ActivityIndicator size="small" color={theme.colors.primary} />
                        ) : null}
                      </View>
                    </View>
                  </View>
                </View>

                {/* Live location suggestions while typing */}
                {suggestionField ? (
                  <View
                    style={{
                      backgroundColor: '#fff',
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      marginBottom: 16,
                      overflow: 'hidden',
                    }}
                  >
                    <Pressable
                      onPress={() => applyCurrentLocation(suggestionField)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingVertical: 14,
                        paddingHorizontal: 16,
                        borderBottomWidth: 1,
                        borderBottomColor: theme.colors.border,
                      }}
                    >
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          backgroundColor: '#E0F2FE',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Navigation size={17} color="#2563EB" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.ink }}>
                          Use my current location
                        </Text>
                        <Text style={{ fontSize: 11, color: theme.colors.muted }}>
                          {suggestionField === 'pickup'
                            ? 'Set pickup to where you are right now'
                            : 'Set the destination to where you are right now'}
                        </Text>
                      </View>
                    </Pressable>
                    {suggestionsLoading ? (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                          paddingVertical: 14,
                          paddingHorizontal: 16,
                        }}
                      >
                        <ActivityIndicator size="small" color={theme.colors.primary} />
                        <Text style={{ fontSize: 13, color: theme.colors.muted }}>
                          Searching places…
                        </Text>
                      </View>
                    ) : null}
                    {suggestionError ? (
                      <View
                        style={{
                          paddingVertical: 12,
                          paddingHorizontal: 16,
                          backgroundColor: '#FEF2F2',
                        }}
                      >
                        <Text style={{ fontSize: 12, color: '#DC2626' }}>{suggestionError}</Text>
                      </View>
                    ) : null}
                    {!suggestionsLoading && !suggestionError
                      ? (suggestionField === 'pickup' ? pickupSuggestions : dropoffSuggestions).map(
                          (suggestion) => (
                            <Pressable
                              key={suggestion.placeId}
                              onPress={() => selectSuggestion(suggestionField, suggestion)}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 12,
                                paddingVertical: 13,
                                paddingHorizontal: 16,
                                borderBottomWidth: 1,
                                borderBottomColor: 'rgba(0,0,0,0.04)',
                              }}
                            >
                              <View
                                style={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: 10,
                                  backgroundColor: theme.colors.surfaceMuted,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <MapPinIcon size={17} color={theme.colors.primary} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text
                                  style={{
                                    fontSize: 14,
                                    fontWeight: '600',
                                    color: theme.colors.ink,
                                    lineHeight: 20,
                                  }}
                                >
                                  {suggestion.mainText}
                                </Text>
                                {suggestion.secondaryText ? (
                                  <Text
                                    style={{
                                      fontSize: 12,
                                      color: theme.colors.muted,
                                      lineHeight: 16,
                                    }}
                                    numberOfLines={1}
                                  >
                                    {suggestion.secondaryText}
                                  </Text>
                                ) : null}
                              </View>
                            </Pressable>
                          )
                        )
                      : null}
                    {!suggestionsLoading &&
                    !suggestionError &&
                    (suggestionField === 'pickup' ? pickupSuggestions : dropoffSuggestions)
                      .length === 0 ? (
                      <Text
                        style={{
                          fontSize: 12,
                          color: theme.colors.muted,
                          paddingVertical: 12,
                          paddingHorizontal: 16,
                        }}
                      >
                        {(suggestionField === 'pickup' ? pickupText : dropoffText).trim().length < 3
                          ? 'Type at least 3 characters to search…'
                          : 'No places found. Try a different search.'}
                      </Text>
                    ) : null}
                  </View>
                ) : null}

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
                      const selected = vt.key === vehicleType;
                      return (
                        <Pressable
                          key={vt.key}
                          onPress={() => setVehicleType(vt.key)}
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
