import { realtimeEvents } from '@benbax/shared';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BadgeCheck, Bike, Car, User, Wallet } from 'lucide-react-native';
import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { ActiveDeliveryScreen } from '../screens/ActiveDeliveryScreen';
import { ActiveTripScreen } from '../screens/ActiveTripScreen';
import { DeliveryDispatchScreen } from '../screens/DeliveryDispatchScreen';
import { DispatchScreen } from '../screens/DispatchScreen';
import { EarningsScreen } from '../screens/EarningsScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { KycScreen } from '../screens/KycScreen';
import { NewsScreen } from '../screens/NewsScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { OnboardingFlow } from '../screens/OnboardingFlow';
import { PriorityDetailsScreen } from '../screens/PriorityDetailsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';
import { ShiftScheduleScreen } from '../screens/ShiftScheduleScreen';
import { SignInScreen } from '../screens/SignInScreen';
import { WalletCheckoutScreen } from '../screens/WalletCheckoutScreen';
import { WalletScreen } from '../screens/WalletScreen';
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { presentLocalOffer } from '../services/notifications';
import { createRealtimeClient } from '../services/realtime';
import { setSentryUser } from '../services/sentry';
import { useAuthStore } from '../store/authStore';
import type { OfferPoint } from '../store/driverStore';
import { useDriverStore } from '../store/driverStore';
import { useRiderStore } from '../store/riderStore';
import { theme } from '../theme/tokens';
import type { MainTabsParamList, RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabsParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

function toOfferPoint(leg?: {
  label?: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
}): OfferPoint | undefined {
  if (!leg) return undefined;
  const latitude = Number(leg.latitude);
  const longitude = Number(leg.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  return {
    latitude,
    longitude,
    ...(leg.label ? { label: leg.label } : {}),
  };
}

function goToDispatch() {
  if (navigationRef.isReady()) navigationRef.navigate('MainTabs');
}

function DriverRealtimeBridge({ enabled }: { enabled: boolean }) {
  const setCurrentRideOffer = useDriverStore((state) => state.setCurrentOffer);
  const setCurrentDeliveryOffer = useRiderStore((state) => state.setCurrentOffer);

  // Register the Expo push token once authenticated and route taps to Dispatch.
  usePushNotifications({ enabled, onNotificationResponse: goToDispatch });

  useEffect(() => {
    if (!enabled) return;
    let cleanup: () => void = () => undefined;

    createRealtimeClient().then((socket) => {
      socket.on(realtimeEvents.driverOffer, (offer) => {
        const pickup = toOfferPoint({
          label: offer.trip?.pickupLabel,
          latitude: offer.trip?.pickupLatitude,
          longitude: offer.trip?.pickupLongitude,
        });
        const dropoff = toOfferPoint({
          label: offer.trip?.dropoffLabel,
          latitude: offer.trip?.dropoffLatitude,
          longitude: offer.trip?.dropoffLongitude,
        });
        setCurrentRideOffer({
          id: offer.id,
          tripId: offer.tripId,
          score: Number(offer.score),
          expiresAt: offer.expiresAt,
          ...(offer.trip?.passenger?.name ? { passengerName: offer.trip.passenger.name } : {}),
          ...(pickup ? { pickup } : {}),
          ...(dropoff ? { dropoff } : {}),
        });
        void presentLocalOffer({
          title: 'New ride request',
          body: 'A nearby passenger is waiting. Tap to accept or reject.',
          data: { type: 'ride-offer', tripId: offer.tripId },
        });
        Alert.alert(
          'New ride request',
          'A nearby passenger is waiting. Open Dispatch to accept or reject.',
          [
            {
              text: 'View',
              onPress: goToDispatch,
            },
            { text: 'Later', style: 'cancel' },
          ]
        );
      });
      socket.on(realtimeEvents.riderOffer, (offer) => {
        const pickup = toOfferPoint({
          label: offer.delivery?.pickupLabel,
          latitude: offer.delivery?.pickupLatitude,
          longitude: offer.delivery?.pickupLongitude,
        });
        const dropoff = toOfferPoint({
          label: offer.delivery?.dropoffLabel,
          latitude: offer.delivery?.dropoffLatitude,
          longitude: offer.delivery?.dropoffLongitude,
        });
        setCurrentDeliveryOffer({
          id: offer.id,
          deliveryId: offer.deliveryId,
          score: Number(offer.score),
          expiresAt: offer.expiresAt,
          ...(offer.delivery?.customer?.name ? { customerName: offer.delivery.customer.name } : {}),
          ...(pickup ? { pickup } : {}),
          ...(dropoff ? { dropoff } : {}),
        });
        void presentLocalOffer({
          title: 'New delivery offer',
          body: 'A nearby customer delivery is waiting. Tap to accept or reject.',
          data: { type: 'delivery-offer', deliveryId: offer.deliveryId },
        });
        Alert.alert(
          'New delivery offer',
          'A nearby customer delivery is waiting. Open Delivery Dispatch to accept or reject.',
          [
            {
              text: 'View',
              onPress: goToDispatch,
            },
            { text: 'Later', style: 'cancel' },
          ]
        );
      });
      socket.on(realtimeEvents.clientRegistered, (client: { name?: string }) => {
        void presentLocalOffer({
          title: 'New passenger on Benbax',
          body: client?.name
            ? `${client.name} just joined. More riders means more trips.`
            : 'A new passenger just joined. More riders means more trips.',
          data: { type: 'client-registered' },
        });
      });
      socket.on(realtimeEvents.rideAssigned, (assignment) => {
        if (assignment.tripId) setCurrentRideOffer(null);
      });
      socket.on(realtimeEvents.deliveryAssigned, (assignment) => {
        if (assignment.deliveryId) setCurrentDeliveryOffer(null);
      });
      cleanup = () => socket.disconnect();
    });

    return () => cleanup();
  }, [enabled, setCurrentDeliveryOffer, setCurrentRideOffer]);

  return null;
}

function MainTabs() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 10);

  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarStyle: {
          borderTopColor: theme.colors.border,
          height: 58 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="RideDispatch"
        component={DispatchScreen}
        options={{ title: 'Rides', tabBarIcon: ({ color }) => <Car size={20} color={color} /> }}
      />
      <Tabs.Screen
        name="DeliveryDispatch"
        component={DeliveryDispatchScreen}
        options={{
          title: 'Deliveries',
          tabBarIcon: ({ color }) => <Bike size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="Earnings"
        component={EarningsScreen}
        options={{ tabBarIcon: ({ color }) => <Wallet size={20} color={color} /> }}
      />
      <Tabs.Screen
        name="KYC"
        component={KycScreen}
        options={{ tabBarIcon: ({ color }) => <BadgeCheck size={20} color={color} /> }}
      />
      <Tabs.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: ({ color }) => <User size={20} color={color} /> }}
      />
    </Tabs.Navigator>
  );
}

/** Wraps OnboardingFlow and handles redirect to MainTabs when onboarding is complete. */
function OnboardingFlowWrapper({ navigation }: any) {
  const onboardingComplete = useAuthStore((s) => s.onboardingComplete);
  const hasRedirected = useRef(false);

  const handleComplete = useCallback(() => {
    hasRedirected.current = true;
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs' }],
    });
  }, [navigation]);

  // If onboarding is already complete (e.g. returning user), redirect immediately
  useEffect(() => {
    if (onboardingComplete && !hasRedirected.current) {
      hasRedirected.current = true;
      navigation.reset({
        index: 0,
        routes: [{ name: 'MainTabs' }],
      });
    }
  }, [onboardingComplete, navigation]);

  if (onboardingComplete) return null;

  return <OnboardingFlow onComplete={handleComplete} />;
}

export function RootNavigator() {
  const { user, isHydrating, hydrate, hasSeenWelcome } = useAuthStore();
  const hydratePreferences = useDriverStore((s) => s.hydratePreferences);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    setSentryUser(user ? { id: user.id, phone: user.phone } : null);
    if (user) {
      hydratePreferences();
    }
  }, [user, hydratePreferences]);

  if (isHydrating) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.canvas,
        }}
      >
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <DriverRealtimeBridge enabled={Boolean(user)} />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            {/* Always render OnboardingFlow — the wrapper handles showing/hiding */}
            <Stack.Screen name="OnboardingFlow" component={OnboardingFlowWrapper} />
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="ActiveTrip" component={ActiveTripScreen} />
            <Stack.Screen name="ActiveDelivery" component={ActiveDeliveryScreen} />
            <Stack.Screen name="WalletCheckout" component={WalletCheckoutScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen name="Wallet" component={WalletScreen} />
            <Stack.Screen name="PriorityDetails" component={PriorityDetailsScreen} />
            <Stack.Screen name="ShiftSchedule" component={ShiftScheduleScreen} />
            <Stack.Screen name="News" component={NewsScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
          </>
        ) : (
          <Stack.Group screenOptions={{ headerShown: false }}>
            {!hasSeenWelcome ? <Stack.Screen name="Welcome" component={WelcomeScreen} /> : null}
            <Stack.Screen name="SignIn" component={SignInScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
