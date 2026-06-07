import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { useVerifyPayment } from '../hooks/usePayments';
import type { RootStackParamList } from '../navigation/types';
import { theme } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'PaymentCheckout'>;

export function PaymentCheckoutScreen({ navigation, route }: Props) {
  const verifyPayment = useVerifyPayment();
  const hasFinalized = useRef(false);
  const [isOpeningCheckout, setIsOpeningCheckout] = useState(false);
  const { authorizationUrl, reference, deliveryId } = route.params;

  async function finalizePayment() {
    if (hasFinalized.current) return;
    hasFinalized.current = true;

    try {
      await verifyPayment.mutateAsync(reference);
      navigation.replace('Tracking', { deliveryId });
    } catch (error) {
      hasFinalized.current = false;
      Alert.alert(
        'Payment not confirmed',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  }

  async function openCheckout() {
    setIsOpeningCheckout(true);

    try {
      await Linking.openURL(authorizationUrl);
    } catch (error) {
      Alert.alert(
        'Could not open checkout',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setIsOpeningCheckout(false);
    }
  }

  useEffect(() => {
    void openCheckout();

    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (url.startsWith('benbax://payment/callback')) {
        void finalizePayment();
      }
    });

    return () => subscription.remove();
    // Only run once for this checkout screen.
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!hasFinalized.current) {
        void finalizePayment();
      }
    });

    return unsubscribe;
  }, [navigation]);

  async function handleVerifyPress() {
    if (verifyPayment.isPending) {
      return;
    }

    await finalizePayment();
  }

  async function handleOpenPress() {
    if (isOpeningCheckout) {
      return;
    }

    await openCheckout();
  }

  async function handleCancelPress() {
    if (!hasFinalized.current) {
      hasFinalized.current = true;
      navigation.goBack();
    }
  }

  return (
    <Screen scroll={false}>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 24, fontWeight: '900', color: theme.colors.ink }}>
          Secure payment
        </Text>
        <Text style={{ color: theme.colors.muted }}>
          Complete checkout to confirm your delivery.
        </Text>
      </View>

      <View style={{ flex: 1, minHeight: 520, justifyContent: 'center', gap: 18 }}>
        <View
          style={{
            gap: 14,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            padding: 18,
          }}
        >
          {isOpeningCheckout || verifyPayment.isPending ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : null}

          <Text style={{ fontSize: 18, fontWeight: '800', color: theme.colors.ink }}>
            Checkout opened in your browser
          </Text>
          <Text style={{ color: theme.colors.muted, lineHeight: 20 }}>
            Complete the Paystack checkout in the browser, then return to Benbax to confirm your
            payment.
          </Text>

          <Pressable
            onPress={handleOpenPress}
            disabled={isOpeningCheckout}
            style={{
              alignItems: 'center',
              borderRadius: 8,
              backgroundColor: theme.colors.primary,
              paddingVertical: 14,
              opacity: isOpeningCheckout ? 0.65 : 1,
            }}
          >
            <Text style={{ color: 'white', fontWeight: '800' }}>Open checkout</Text>
          </Pressable>

          <Pressable
            onPress={handleVerifyPress}
            disabled={verifyPayment.isPending}
            style={{
              alignItems: 'center',
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingVertical: 14,
              opacity: verifyPayment.isPending ? 0.65 : 1,
            }}
          >
            <Text style={{ color: theme.colors.ink, fontWeight: '800' }}>I have paid</Text>
          </Pressable>

          <Pressable
            onPress={handleCancelPress}
            style={{ alignItems: 'center', paddingVertical: 8 }}
          >
            <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
