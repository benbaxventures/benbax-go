import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Headphones, Home, Package, User, Wallet } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setGlobalErrorFallback } from '../components/ErrorBoundary';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { PaymentCheckoutScreen } from '../screens/PaymentCheckoutScreen';
import { PrivacyProtectionScreen } from '../screens/PrivacyProtectionScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';
import { RideTrackingScreen } from '../screens/RideTrackingScreen';
import { SignInScreen } from '../screens/SignInScreen';
import { SupportScreen } from '../screens/SupportScreen';
import { TrackingScreen } from '../screens/TrackingScreen';
import { WalletCheckoutScreen } from '../screens/WalletCheckoutScreen';
import { WalletScreen } from '../screens/WalletScreen';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme/tokens';
import type { MainTabsParamList, RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabsParamList>();

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
        name="Home"
        component={HomeScreen}
        options={{ tabBarIcon: ({ color }) => <Home size={20} color={color} /> }}
      />
      <Tabs.Screen
        name="Orders"
        component={OrdersScreen}
        options={{ tabBarIcon: ({ color }) => <Package size={20} color={color} /> }}
      />
      <Tabs.Screen
        name="Wallet"
        component={WalletScreen}
        options={{ tabBarIcon: ({ color }) => <Wallet size={20} color={color} /> }}
      />
      <Tabs.Screen
        name="Support"
        component={SupportScreen}
        options={{ tabBarIcon: ({ color }) => <Headphones size={20} color={color} /> }}
      />
      <Tabs.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: ({ color }) => <User size={20} color={color} /> }}
      />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const { user, isHydrating, hydrate } = useAuthStore();
  const [hydrateError, setHydrateError] = useState<string | null>(null);
  const hydrateAttempted = useRef(false);

  const doHydrate = useCallback(async () => {
    if (hydrateAttempted.current) return;
    hydrateAttempted.current = true;
    try {
      await hydrate();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restore session';
      console.warn('[hydrate]', message);
      setHydrateError(message);
    }
  }, [hydrate]);

  useEffect(() => {
    doHydrate();
  }, [doHydrate]);

  setGlobalErrorFallback(() => {
    hydrateAttempted.current = false;
    setHydrateError(null);
    doHydrate();
  });

  if (hydrateError) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.canvas,
          padding: 32,
          gap: 12,
        }}
      >
        <Text
          style={{ fontSize: 18, fontWeight: '800', color: theme.colors.ink, textAlign: 'center' }}
        >
          Session restore failed
        </Text>
        <Text style={{ color: theme.colors.muted, textAlign: 'center', fontSize: 14 }}>
          {hydrateError}
        </Text>
        <Text style={{ color: theme.colors.muted, textAlign: 'center', fontSize: 14 }}>
          Your session data may be corrupted. Try restarting the app or reinstalling.
        </Text>
      </View>
    );
  }

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
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="Tracking" component={TrackingScreen} />
            <Stack.Screen name="RideTracking" component={RideTrackingScreen} />
            <Stack.Screen name="PaymentCheckout" component={PaymentCheckoutScreen} />
            <Stack.Screen name="WalletCheckout" component={WalletCheckoutScreen} />
            <Stack.Screen name="PrivacyProtection" component={PrivacyProtectionScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
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
