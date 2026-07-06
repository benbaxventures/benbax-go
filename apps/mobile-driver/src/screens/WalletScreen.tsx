import type { NavigationProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import { CreditCard, History, Smartphone, Zap } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { Button } from '../components/Button';
import { ErrorState } from '../components/ErrorState';
import { OfflineBanner } from '../components/OfflineBanner';
import { Screen } from '../components/Screen';
import { SkeletonBlock } from '../components/SkeletonBlock';
import { useWallet, useWalletTopup } from '../hooks/usePayments';
import type { RootStackParamList } from '../navigation/types';
import { ApiConnectionError, ApiResponseError, apiRequest } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme/tokens';

export function WalletScreen() {
  const [amount, setAmount] = useState('10.00');
  const topup = useWalletTopup();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const user = useAuthStore((s) => s.user);
  const { data: wallet, isLoading: walletLoading, isError, error, refetch } = useWallet();
  const transactions = wallet?.transactions ?? [];

  async function handleTopup() {
    const parsed = Number(amount);
    if (!parsed || parsed <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid top-up amount.');
      return;
    }

    if (!user?.email) {
      Alert.alert(
        'Email required',
        'You need to add an email to your profile before using Paystack.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add email', onPress: () => navigation.navigate('EditProfile') },
        ]
      );
      return;
    }

    try {
      const result = await topup.mutateAsync({ amount: parsed });
      if (result.checkout) {
        navigation.navigate('WalletCheckout', {
          authorizationUrl: result.checkout.authorizationUrl,
          reference: result.checkout.reference,
          walletTransactionId: result.walletTransaction?.id ?? undefined,
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

      Alert.alert(
        'Could not start top-up',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  }

  async function handleInstantPayout() {
    const balance = wallet?.balance ? Number(wallet.balance) : 0;
    if (balance <= 0) {
      Alert.alert('No balance', 'You need funds in your wallet to withdraw.');
      return;
    }

    Alert.alert(
      'Instant Payout',
      `Withdraw GHS ${balance.toFixed(2)} to your registered MoMo number instantly?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw now',
          onPress: async () => {
            try {
              await apiRequest('/payments/instant-payout', {
                method: 'POST',
                body: JSON.stringify({ amount: balance }),
              });
              Alert.alert('Payout initiated', 'Your withdrawal is being processed.');
              refetch();
            } catch (err) {
              Alert.alert(
                'Payout failed',
                err instanceof Error ? err.message : 'Could not process payout.'
              );
            }
          },
        },
      ]
    );
  }

  // ---- Loading skeleton ----
  if (walletLoading) {
    return (
      <Screen>
        <SkeletonBlock width={100} height={28} />
        <SkeletonBlock height={110} borderRadius={10} />
        <SkeletonBlock height={44} borderRadius={8} />
        <SkeletonBlock height={52} borderRadius={8} />
        <SkeletonBlock height={52} borderRadius={8} />
        <SkeletonBlock height={40} borderRadius={8} />
        <View style={{ marginTop: 12 }}>
          <SkeletonBlock width={140} height={16} />
          <View style={{ marginTop: 8, gap: 8 }}>
            <SkeletonBlock height={56} borderRadius={8} />
            <SkeletonBlock height={56} borderRadius={8} />
            <SkeletonBlock height={56} borderRadius={8} />
          </View>
        </View>
      </Screen>
    );
  }

  // ---- Error state ----
  if (isError) {
    return (
      <Screen>
        <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>Wallet</Text>
        <OfflineBanner />
        <ErrorState
          title="Could not load wallet"
          message={
            error instanceof Error ? error.message : 'Please check your connection and try again.'
          }
          onRetry={() => refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <OfflineBanner />

      <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>Wallet</Text>

      <View style={{ backgroundColor: theme.colors.primary, borderRadius: 8, padding: 18, gap: 8 }}>
        <Text style={{ color: '#D7FFF5', fontWeight: '700' }}>Available balance</Text>
        <Text style={{ color: '#fff', fontSize: 34, fontWeight: '900' }}>
          GHS {wallet?.balance ? Number(wallet.balance).toFixed(2) : '0.00'}
        </Text>
      </View>

      <View style={{ marginTop: 12 }}>
        <Text style={{ color: theme.colors.muted, marginBottom: 6 }}>Amount (GHS)</Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          style={{
            height: 44,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 8,
            paddingHorizontal: 12,
            backgroundColor: theme.colors.surface,
          }}
        />
      </View>

      <Button
        label="Top up with MTN MoMo"
        icon={<Smartphone size={18} color="#fff" />}
        onPress={handleTopup}
      />
      <Button
        label="Pay with card"
        icon={<CreditCard size={18} color={theme.colors.ink} />}
        onPress={handleTopup}
        variant="secondary"
        loading={topup.isPending}
      />
      {(wallet?.balance ? Number(wallet.balance) : 0) > 0 && (
        <Button
          label="Instant payout"
          icon={<Zap size={18} color="#fff" />}
          onPress={handleInstantPayout}
        />
      )}
      <Text style={{ color: theme.colors.muted }}>
        Supports MTN Mobile Money, Paystack cards, wallet balance, and cash-on-delivery.
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
        <History size={16} color={theme.colors.muted} />
        <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>Transaction history</Text>
      </View>

      {transactions.length === 0 ? (
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 8,
            padding: 24,
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Text style={{ color: theme.colors.muted }}>No transactions yet.</Text>
          <Text style={{ color: theme.colors.muted, fontSize: 13, textAlign: 'center' }}>
            Your earnings from trips and any withdrawals will appear here.
          </Text>
        </View>
      ) : (
        <ScrollView style={{ maxHeight: 280 }}>
          {transactions.map((tx: any) => (
            <View
              key={tx.id}
              style={{
                backgroundColor: theme.colors.surface,
                borderRadius: 8,
                padding: 14,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.ink, fontWeight: '700' }}>
                  {tx.description || tx.type}
                </Text>
                <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                  {new Date(tx.createdAt).toLocaleDateString('en-GH', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </Text>
              </View>
              <Text
                style={{
                  color: tx.amount > 0 ? theme.colors.primary : theme.colors.danger,
                  fontWeight: '900',
                }}
              >
                {tx.amount > 0 ? '+' : ''}GHS {Number(Math.abs(tx.amount)).toFixed(2)}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}
