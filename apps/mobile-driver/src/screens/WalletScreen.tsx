import { History } from 'lucide-react-native';
import { Text, View, ScrollView, Alert } from 'react-native';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { theme } from '../theme/tokens';
import { useWallet } from '../hooks/usePayments';
import { useAuthStore } from '../store/authStore';

export function WalletScreen() {
  const user = useAuthStore((s) => s.user as any);
  const { data: wallet, isLoading: walletLoading } = useWallet();
  const transactions = wallet?.transactions ?? [];

  function handleWithdraw() {
    Alert.alert('Coming soon', 'Withdrawals will be available once you complete your first trip.');
  }

  return (
    <Screen>
      <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>Wallet</Text>

      <View style={{ backgroundColor: theme.colors.primary, borderRadius: 8, padding: 18, gap: 4 }}>
        <Text style={{ color: '#D7FFF5', fontWeight: '700' }}>Earnings balance</Text>
        <Text style={{ color: '#fff', fontSize: 34, fontWeight: '900' }}>
          GHS {walletLoading ? '--' : (wallet?.balance ? Number(wallet.balance).toFixed(2) : '0.00')}
        </Text>
      </View>

      <Button label="Withdraw earnings" onPress={handleWithdraw} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <History size={16} color={theme.colors.muted} />
        <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>Transaction history</Text>
      </View>

      {walletLoading ? (
        <Text style={{ color: theme.colors.muted }}>Loading transactions...</Text>
      ) : transactions.length === 0 ? (
        <View style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 24, alignItems: 'center', gap: 8 }}>
          <Text style={{ color: theme.colors.muted }}>No transactions yet.</Text>
          <Text style={{ color: theme.colors.muted, fontSize: 13, textAlign: 'center' }}>
            Your earnings from trips and any withdrawals will appear here.
          </Text>
        </View>
      ) : (
        <ScrollView style={{ maxHeight: 280 }}>
          {transactions.map((tx: any) => (
            <View key={tx.id} style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.ink, fontWeight: '700' }}>{tx.description || tx.type}</Text>
                <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                  {new Date(tx.createdAt).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
              </View>
              <Text style={{ color: tx.amount > 0 ? theme.colors.primary : theme.colors.danger, fontWeight: '900' }}>
                {tx.amount > 0 ? '+' : ''}GHS {Number(Math.abs(tx.amount)).toFixed(2)}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}
