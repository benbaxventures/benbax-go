import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddressPoint, DeliveryCategory, DeliveryQuote, DeliverySummary } from '../shared';
import { apiRequest } from '../services/api';

export function useDeliveryQuote() {
  return useMutation({
    mutationFn: (input: { category: DeliveryCategory; pickup: AddressPoint; dropoff: AddressPoint }) =>
      apiRequest<DeliveryQuote>('/deliveries/quote', {
        method: 'POST',
        body: JSON.stringify(input)
      })
  });
}

export function useCreateDelivery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      category: DeliveryCategory;
      pickup: AddressPoint;
      dropoff: AddressPoint;
      paymentMethod: 'MTN_MOMO' | 'PAYSTACK_CARD' | 'WALLET' | 'CASH_ON_DELIVERY';
      scheduledFor?: string;
      notes?: string;
    }) =>
      apiRequest<DeliverySummary>('/deliveries', {
        method: 'POST',
        body: JSON.stringify(input)
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deliveries'] })
  });
}

export function useDeliveries() {
  return useQuery({
    queryKey: ['deliveries'],
    queryFn: () => apiRequest<DeliverySummary[]>('/deliveries')
  });
}
