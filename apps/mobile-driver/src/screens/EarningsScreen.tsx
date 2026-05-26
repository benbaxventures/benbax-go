import { TrendingUp, WalletCards } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { theme } from '../theme/tokens';

export function EarningsScreen() {
  return (
    <Screen>
      <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>Earnings</Text>
      <View style={{ backgroundColor: theme.colors.primary, borderRadius: 8, padding: 18, gap: 8 }}>
        <WalletCards size={24} color="#fff" />
        <Text style={{ color: '#D7FFF5', fontWeight: '700' }}>Today</Text>
        <Text style={{ color: '#fff', fontSize: 34, fontWeight: '900' }}>GHS 0.00</Text>
      </View>
      <View style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 16, gap: 6 }}>
        <TrendingUp size={22} color={theme.colors.primary} />
        <Text style={{ color: theme.colors.ink, fontWeight: '900' }}>Performance analytics</Text>
        <Text style={{ color: theme.colors.muted }}>Completion rate, acceptance rate, ratings, and route efficiency will drive incentives.</Text>
      </View>
      <Button label="Withdraw to MoMo" onPress={() => undefined} />
    </Screen>
  );
}
