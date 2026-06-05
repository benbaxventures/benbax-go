import { NavigationContainer } from '@react-navigation/native';
import { createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BadgeCheck, Bike, Car, User, Wallet } from 'lucide-react-native';
import { useEffect } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { realtimeEvents } from '@benbax/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActiveTripScreen } from '../screens/ActiveTripScreen';
import { ActiveDeliveryScreen } from '../screens/ActiveDeliveryScreen';
import { DeliveryDispatchScreen } from '../screens/DeliveryDispatchScreen';
import { DispatchScreen } from '../screens/DispatchScreen';
import { EarningsScreen } from '../screens/EarningsScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { KycScreen } from '../screens/KycScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';
import { SignInScreen } from '../screens/SignInScreen';
import { WalletCheckoutScreen } from '../screens/WalletCheckoutScreen';
import { WalletScreen } from '../screens/WalletScreen';
import { createRealtimeClient } from '../services/realtime';
import { useAuthStore } from '../store/authStore';
import { useDriverStore } from '../store/driverStore';
import { useRiderStore } from '../store/riderStore';
import { theme } from '../theme/tokens';
import type { MainTabsParamList, RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabsParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

function DriverRealtimeBridge({ enabled }: { enabled: boolean }) {
  const setCurrentRideOffer = useDriverStore((state) => state.setCurrentOffer);
  const setCurrentDeliveryOffer = useRiderStore((state) => state.setCurrentOffer);

  useEffect(() => {
    if (!enabled) return;
    let cleanup: () => void = () => undefined;

    createRealtimeClient().then((socket) => {
      socket.on(realtimeEvents.driverOffer, (offer) => {
        setCurrentRideOffer({
          id: offer.id,
          tripId: offer.tripId,
          score: Number(offer.score),
          expiresAt: offer.expiresAt
        });
        Alert.alert('New ride request', 'A nearby passenger is waiting. Open Dispatch to accept or reject.', [
          {
            text: 'View',
            onPress: () => {
              if (navigationRef.isReady()) navigationRef.navigate('MainTabs');
            }
          },
          { text: 'Later', style: 'cancel' }
        ]);
      });
      socket.on(realtimeEvents.riderOffer, (offer) => {
        setCurrentDeliveryOffer({
          id: offer.id,
          deliveryId: offer.deliveryId,
          score: Number(offer.score),
          expiresAt: offer.expiresAt
        });
        Alert.alert('New delivery offer', 'A nearby customer delivery is waiting. Open Delivery Dispatch to accept or reject.', [
          {
            text: 'View',
            onPress: () => {
              if (navigationRef.isReady()) navigationRef.navigate('MainTabs');
            }
          },
          { text: 'Later', style: 'cancel' }
        ]);
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
          paddingTop: 8
        }
      }}
    >
      <Tabs.Screen name="RideDispatch" component={DispatchScreen} options={{ title: 'Rides', tabBarIcon: ({ color }) => <Car size={20} color={color} /> }} />
      <Tabs.Screen name="DeliveryDispatch" component={DeliveryDispatchScreen} options={{ title: 'Deliveries', tabBarIcon: ({ color }) => <Bike size={20} color={color} /> }} />
      <Tabs.Screen name="Earnings" component={EarningsScreen} options={{ tabBarIcon: ({ color }) => <Wallet size={20} color={color} /> }} />
      <Tabs.Screen name="KYC" component={KycScreen} options={{ tabBarIcon: ({ color }) => <BadgeCheck size={20} color={color} /> }} />
      <Tabs.Screen name="Profile" component={ProfileScreen} options={{ tabBarIcon: ({ color }) => <User size={20} color={color} /> }} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const { user, isHydrating, hydrate } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (isHydrating) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.canvas }}>
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
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="ActiveTrip" component={ActiveTripScreen} />
            <Stack.Screen name="ActiveDelivery" component={ActiveDeliveryScreen} />
            <Stack.Screen name="WalletCheckout" component={WalletCheckoutScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen name="Wallet" component={WalletScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="SignIn" component={SignInScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
