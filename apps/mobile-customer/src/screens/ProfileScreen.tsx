import { NavigationProp, useNavigation } from '@react-navigation/native';
import { LogOut, MapPinned, ShieldCheck } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { Button } from '../components/Button';
import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../components/Screen';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme/tokens';

export function ProfileScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { user, logout } = useAuthStore();

  return (
    <Screen>
      <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>Profile</Text>
      <View style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 16, gap: 6 }}>
        <Text style={{ color: theme.colors.ink, fontSize: 20, fontWeight: '900' }}>{user?.name}</Text>
        <Text style={{ color: theme.colors.muted }}>{user?.phone}</Text>
        <Text style={{ color: theme.colors.muted }}>{user?.email ?? 'No email'}</Text>
      </View>
      <Button label="Edit profile" icon={<MapPinned size={18} color={theme.colors.ink} />} onPress={() => navigation.navigate('EditProfile')} variant="secondary" />
      <Button label="Saved locations" icon={<MapPinned size={18} color={theme.colors.ink} />} onPress={() => undefined} variant="secondary" />
      <Button
        label="Privacy protection"
        icon={<ShieldCheck size={18} color={theme.colors.ink} />}
        onPress={() => navigation.navigate('PrivacyProtection')}
        variant="secondary"
      />
      <Button label="Sign out" icon={<LogOut size={18} color="#fff" />} onPress={logout} />
    </Screen>
  );
}
