import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Headphones, Home, Package, User, Wallet } from 'lucide-react-native';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme/tokens';
import { HomeScreen } from '../screens/HomeScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { PaymentCheckoutScreen } from '../screens/PaymentCheckoutScreen';
import { WalletCheckoutScreen } from '../screens/WalletCheckoutScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { PrivacyProtectionScreen } from '../screens/PrivacyProtectionScreen';
import { SignInScreen } from '../screens/SignInScreen';
import { SupportScreen } from '../screens/SupportScreen';
import { TrackingScreen } from '../screens/TrackingScreen';
import { WalletScreen } from '../screens/WalletScreen';
import type { MainTabsParamList, RootStackParamList } from './types';
import { EditProfileScreen } from '../screens/EditProfileScreen';

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
          paddingTop: 8
        }
      }}
    >
      <Tabs.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: ({ color }) => <Home size={20} color={color} /> }} />
      <Tabs.Screen name="Orders" component={OrdersScreen} options={{ tabBarIcon: ({ color }) => <Package size={20} color={color} /> }} />
      <Tabs.Screen name="Wallet" component={WalletScreen} options={{ tabBarIcon: ({ color }) => <Wallet size={20} color={color} /> }} />
      <Tabs.Screen name="Support" component={SupportScreen} options={{ tabBarIcon: ({ color }) => <Headphones size={20} color={color} /> }} />
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
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="Tracking" component={TrackingScreen} />
            <Stack.Screen name="PaymentCheckout" component={PaymentCheckoutScreen} />
            <Stack.Screen name="WalletCheckout" component={WalletCheckoutScreen} />
            <Stack.Screen name="PrivacyProtection" component={PrivacyProtectionScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
          </>
        ) : (
          <Stack.Screen name="SignIn" component={SignInScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
