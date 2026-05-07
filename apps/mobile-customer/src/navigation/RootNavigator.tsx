import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Headphones, Home, Package, User, Wallet } from 'lucide-react-native';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme/tokens';
import { HomeScreen } from '../screens/HomeScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SignInScreen } from '../screens/SignInScreen';
import { SupportScreen } from '../screens/SupportScreen';
import { TrackingScreen } from '../screens/TrackingScreen';
import { WalletScreen } from '../screens/WalletScreen';
import type { MainTabsParamList, RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabsParamList>();

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarStyle: { borderTopColor: theme.colors.border, height: 62, paddingBottom: 8, paddingTop: 8 }
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
          </>
        ) : (
          <Stack.Screen name="SignIn" component={SignInScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
