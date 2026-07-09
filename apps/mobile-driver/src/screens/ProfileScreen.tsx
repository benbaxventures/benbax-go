import { Headphones, LogOut, MessageSquareText, Phone, ShieldCheck } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { BENBAX_PHONE, callPhone, openWhatsApp } from '../services/contact';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme/tokens';

export function ProfileScreen() {
  const { user, logout } = useAuthStore();

  return (
    <Screen>
      <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>Profile</Text>
      <View style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 16, gap: 6 }}>
        <Text style={{ color: theme.colors.ink, fontSize: 20, fontWeight: '900' }}>
          {user?.name}
        </Text>
        <Text style={{ color: theme.colors.muted }}>{user?.phone}</Text>
      </View>
      <View style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 16, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Headphones size={20} color={theme.colors.primary} />
          <Text style={{ color: theme.colors.ink, fontWeight: '900' }}>Benbax Support</Text>
        </View>
        <Text style={{ color: theme.colors.muted }}>Contact us via call or WhatsApp.</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button
              label="Call"
              icon={<Phone size={18} color="#fff" />}
              onPress={() => callPhone(BENBAX_PHONE)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="WhatsApp"
              icon={<MessageSquareText size={18} color="#fff" />}
              onPress={() => openWhatsApp(BENBAX_PHONE)}
            />
          </View>
        </View>
      </View>
      <Button
        label="Safety center"
        icon={<ShieldCheck size={18} color={theme.colors.ink} />}
        onPress={() => undefined}
        variant="secondary"
      />
      <Button label="Sign out" icon={<LogOut size={18} color="#fff" />} onPress={logout} />
    </Screen>
  );
}
