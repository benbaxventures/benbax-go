import { LogOut, ShieldCheck } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme/tokens';

export function ProfileScreen() {
  const { user, logout } = useAuthStore();

  return (
    <Screen>
      <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>Profile</Text>
      <View style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 16, gap: 6 }}>
        <Text style={{ color: theme.colors.ink, fontSize: 20, fontWeight: '900' }}>{user?.name}</Text>
        <Text style={{ color: theme.colors.muted }}>{user?.phone}</Text>
      </View>
      <Button label="Safety center" icon={<ShieldCheck size={18} color={theme.colors.ink} />} onPress={() => undefined} variant="secondary" />
      <Button label="Sign out" icon={<LogOut size={18} color="#fff" />} onPress={logout} />
    </Screen>
  );
}
