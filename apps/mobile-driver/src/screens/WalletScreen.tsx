import { CreditCard, History, Smartphone } from 'lucide-react-native';
import { Text, View, TextInput, ScrollView, Alert } from 'react-native';
import { useState } from 'react';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { theme } from '../theme/tokens';
import { useWalletTopup, useWallet } from '../hooks/usePayments';
import { useAuthStore } from '../store/authStore';
import { ApiResponseError, ApiConnectionError } from '../services/api';
import type { RootStackParamList } from '../navigation/types';

export function WalletScreen() {
  const [amount, setAmount] = useState('10.00');
  const topup = useWalletTopup();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const user = useAuthStore((s) => s.user as any);
  const { data: wallet, isLoading: walletLoading } = useWallet();
  const transactions = wallet?.transactions ?? [];

  function handleWithdraw() {
    Alert.alert('Coming soon', 'Withdrawals will be available once you complete your first trip.');
  }

  async function handleTopup() {
    const parsed = Number(amount);
    if (!parsed || parsed <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid top-up amount.');
      return;
    }

    if (!user?.email) {
      Alert.alert('Email required', 'You need to add an email to your profile before using Paystack.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Add email', onPress: () => navigation.navigate('EditProfile') }
      ]);
      return;
    }

    try {
      const result = await topup.mutateAsync({ amount: parsed });
      if (result.checkout) {
        navigation.navigate('WalletCheckout', {
          authorizationUrl: result.checkout.authorizationUrl,
          reference: result.checkout.reference,
          walletTransactionId: result.walletTransaction?.id
        } as any);
        return;
      }

      Alert.alert('Top-up started', 'Please complete the checkout.');
    } catch (error) {
      if (error instanceof ApiResponseError) {
        if (error.status === 401) {
          await useAuthStore.getState().logout();
          Alert.alert('Session expired', 'Please sign in again to continue.');
          return;
        }
        Alert.alert('Could not start top-up', error.message || 'Please try again.');
        return;
      }

      if (error instanceof ApiConnectionError) {
        Alert.alert('Could not start top-up', error.message);
        return;
      }

      Alert.alert('Could not start top-up', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>Wallet</Text>

      <View style={{ backgroundColor: theme.colors.primary, borderRadius: 8, padding: 18, gap: 8 }}>
        <Text style={{ color: '#D7FFF5', fontWeight: '700' }}>Available balance</Text>
        <Text style={{ color: '#fff', fontSize: 34, fontWeight: '900' }}>
          GHS {walletLoading ? '--' : (wallet?.balance ? Number(wallet.balance).toFixed(2) : '0.00')}
        </Text>
      </View>

      <View style={{ marginTop: 12 }}>
        <Text style={{ color: theme.colors.muted, marginBottom: 6 }}>Amount (GHS)</Text>
        <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={{ height: 44, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, paddingHorizontal: 12, backgroundColor: theme.colors.surface }} />
      </View>

      <Button label="Top up with MTN MoMo" icon={<Smartphone size={18} color="#fff" />} onPress={handleTopup} />
      <Button label="Pay with card" icon={<CreditCard size={18} color={theme.colors.ink} />} onPress={handleTopup} variant="secondary" loading={topup.isPending} />
      <Text style={{ color: theme.colors.muted }}>Supports MTN Mobile Money, Paystack cards, wallet balance, and cash-on-delivery.</Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
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
