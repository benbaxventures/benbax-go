import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '../services/api';
import type { AddressPoint, CarTripQuote, CarTripSummary } from '../shared';

export function useTripQuote() {
  return useMutation({
    mutationFn: (input: {
      pickup: AddressPoint;
      dropoff: AddressPoint;
      requestedVehicleType?: string;
    }) =>
      apiRequest<CarTripQuote>('/rides/quote', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}

export function useCreateTrip() {
  return useMutation({
    mutationFn: (input: {
      pickup: AddressPoint;
      dropoff: AddressPoint;
      requestedVehicleType?: string;
      scheduledFor?: string;
      paymentMethod?: 'MTN_MOMO' | 'PAYSTACK_CARD' | 'WALLET' | 'CASH_ON_DELIVERY';
    }) =>
      apiRequest<CarTripSummary>('/rides', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}
