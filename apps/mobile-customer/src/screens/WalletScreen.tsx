import { CreditCard, Smartphone } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { theme } from '../theme/tokens';

export function WalletScreen() {
  return (
    <Screen>
      <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>Wallet</Text>
      <View style={{ backgroundColor: theme.colors.primary, borderRadius: 8, padding: 18, gap: 8 }}>
        <Text style={{ color: '#D7FFF5', fontWeight: '700' }}>Available balance</Text>
        <Text style={{ color: '#fff', fontSize: 34, fontWeight: '900' }}>GHS 0.00</Text>
      </View>
      <Button label="Top up with MTN MoMo" icon={<Smartphone size={18} color="#fff" />} onPress={() => undefined} />
      <Button label="Pay with card" icon={<CreditCard size={18} color={theme.colors.ink} />} onPress={() => undefined} variant="secondary" />
      <Text style={{ color: theme.colors.muted }}>Supports MTN Mobile Money, Paystack cards, wallet balance, and cash-on-delivery.</Text>
    </Screen>
  );
}
