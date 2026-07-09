import type { NavigationProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import { CreditCard, Smartphone } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { useWallet, useWalletTopup } from '../hooks/usePayments';
import type { RootStackParamList } from '../navigation/types';
import { ApiConnectionError, ApiResponseError } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme/tokens';

export function WalletScreen() {
  const [amount, setAmount] = useState('10.00');
  const topup = useWalletTopup();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const user = useAuthStore((s) => s.user);
  const { data: wallet, isLoading: walletLoading } = useWallet();

  async function handlePayWithCard() {
    const parsed = Number(amount);
    if (!parsed || parsed <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid top-up amount.');
      return;
    }

    // Ensure user has email required by Paystack
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
        const checkoutParams: RootStackParamList['WalletCheckout'] = {
          authorizationUrl: result.checkout.authorizationUrl,
          reference: result.checkout.reference,
        };
        if (result.walletTransaction?.id)
          checkoutParams.walletTransactionId = result.walletTransaction.id;
        navigation.navigate('WalletCheckout', checkoutParams);
        return;
      }

      Alert.alert('Top-up started', 'Please complete the checkout.');
    } catch (error) {
      // Handle known API errors to provide clearer guidance
      if (error instanceof ApiResponseError) {
        if (error.status === 401) {
          // Session expired or invalid token — sign the user out and prompt to re-login
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

  return (
    <Screen>
      <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>Wallet</Text>
      <View style={{ backgroundColor: theme.colors.primary, borderRadius: 8, padding: 18, gap: 8 }}>
        <Text style={{ color: '#D7FFF5', fontWeight: '700' }}>Available balance</Text>
        <Text style={{ color: '#fff', fontSize: 34, fontWeight: '900' }}>
          GHS {walletLoading ? '--' : wallet?.balance ? Number(wallet.balance).toFixed(2) : '0.00'}
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
        onPress={handlePayWithCard}
      />
      <Button
        label="Pay with card"
        icon={<CreditCard size={18} color={theme.colors.ink} />}
        onPress={handlePayWithCard}
        variant="secondary"
        loading={topup.isPending}
      />
      <Text style={{ color: theme.colors.muted }}>
        Supports MTN Mobile Money, Paystack cards, wallet balance, and cash-on-delivery.
      </Text>
    </Screen>
  );
}
