import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BadgeCheck, Bike, User, Wallet } from 'lucide-react-native';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActiveDeliveryScreen } from '../screens/ActiveDeliveryScreen';
import { DispatchScreen } from '../screens/DispatchScreen';
import { EarningsScreen } from '../screens/EarningsScreen';
import { KycScreen } from '../screens/KycScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SignInScreen } from '../screens/SignInScreen';
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
          paddingTop: 8
        }
      }}
    >
      <Tabs.Screen name="Dispatch" component={DispatchScreen} options={{ tabBarIcon: ({ color }) => <Bike size={20} color={color} /> }} />
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
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="ActiveDelivery" component={ActiveDeliveryScreen} />
          </>
        ) : (
          <Stack.Screen name="SignIn" component={SignInScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
