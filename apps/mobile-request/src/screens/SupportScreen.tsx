import { Headphones, MessageSquareText, Phone } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { theme } from '../theme/tokens';
import { BENBAX_PHONE, callPhone, openWhatsApp } from '../services/contact';

export function SupportScreen() {
  return (
    <Screen>
      <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>Support</Text>
      <View style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 16, gap: 8 }}>
        <Headphones size={24} color={theme.colors.primary} />
        <Text style={{ color: theme.colors.ink, fontWeight: '900' }}>Smart customer support</Text>
        <Text style={{ color: theme.colors.muted }}>The assistant triages payment, pickup, rider, emergency, and delivery proof issues.</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button label="Call Benbax" icon={<Phone size={18} color="#fff" />} onPress={() => callPhone(BENBAX_PHONE)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="WhatsApp" icon={<MessageSquareText size={18} color="#fff" />} onPress={() => openWhatsApp(BENBAX_PHONE)} />
        </View>
      </View>
    </Screen>
  );
}
