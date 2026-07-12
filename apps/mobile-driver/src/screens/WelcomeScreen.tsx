import { useNavigation } from '@react-navigation/native';
import { type NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Bike, Car } from 'lucide-react-native';
import { Image, Text, View } from 'react-native';
import { Button } from '../components/Button';
import type { RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme/tokens';

export function WelcomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const completeWelcome = useAuthStore((s) => s.completeWelcome);

  function go(params: RootStackParamList['SignIn']) {
    void completeWelcome();
    navigation.navigate('SignIn', params);
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.canvas,
        justifyContent: 'center',
        padding: 24,
        gap: 28,
      }}
    >
      <View style={{ alignItems: 'center', gap: 14 }}>
        <Image
          source={require('../../assets/benbax-logo.png') as number} // eslint-disable-line @typescript-eslint/no-require-imports
          style={{ width: 64, height: 64, borderRadius: 14 }}
          resizeMode="contain"
        />
        <Text style={{ fontSize: 32, fontWeight: '900', color: theme.colors.ink }}>
          Benbax Partner
        </Text>
        <Text style={{ color: theme.colors.muted, fontSize: 16, textAlign: 'center' }}>
          Earn with passenger trips, deliveries, clear routes, and safety-first dispatch.
        </Text>
      </View>

      <View style={{ gap: 12 }}>
        <Button
          label="Sign up as Delivery Rider"
          icon={<Bike size={18} color="#fff" />}
          onPress={() => go({ mode: 'register', role: 'RIDER' })}
        />
        <Button
          label="Sign up as Driver"
          icon={<Car size={18} color="#fff" />}
          onPress={() => go({ mode: 'register', role: 'DRIVER' })}
        />
        <Button
          label="I already partner with Benbax"
          onPress={() => go({ mode: 'login' })}
          variant="secondary"
        />
      </View>
    </View>
  );
}
