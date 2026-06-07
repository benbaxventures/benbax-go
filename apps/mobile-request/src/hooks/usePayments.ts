import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../services/api';

type PaymentMethod = 'MTN_MOMO' | 'PAYSTACK_CARD' | 'WALLET' | 'CASH_ON_DELIVERY';

export type InitializePaymentResult = {
  payment: unknown;
  nextAction:
    | 'COLLECT_ON_DELIVERY'
    | 'AUTHORIZE_MOBILE_MONEY_PROMPT'
    | 'OPEN_PROVIDER_CHECKOUT'
    | 'PAYMENT_COMPLETE';
  checkout?: {
    authorizationUrl: string;
    accessCode: string;
    reference: string;
  };
};

export type WalletTopupResult = {
  checkout?: {
    authorizationUrl: string;
    accessCode?: string;
    reference: string;
  };
  walletTransaction?: {
    id: string;
  };
};

export type WalletResult = {
  balance: string | number;
};

export function useInitializePayment() {
  return useMutation({
    mutationFn: (input: { deliveryId: string; method: PaymentMethod; mobileNumber?: string }) =>
      apiRequest<InitializePaymentResult>('/payments/initialize', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}

export function useVerifyPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reference: string) =>
      apiRequest<{ payment: unknown }>(`/payments/verify/${encodeURIComponent(reference)}`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    },
  });
}

export function useWalletTopup() {
  return useMutation({
    mutationFn: (input: { amount: number }) =>
      apiRequest<WalletTopupResult>('/payments/wallet-topup', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}

export function useVerifyWalletTopup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reference: string) =>
      apiRequest(`/payments/wallet-verify/${encodeURIComponent(reference)}`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
}

export function useWallet() {
  return useQuery({
    queryKey: ['wallet'],
    queryFn: () => apiRequest<WalletResult>('/payments/wallet'),
  });
}
