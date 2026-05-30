import { useMutation } from '@tanstack/react-query';
import type { AddressPoint, RideQuote, RideTripSummary } from '../shared';
import { apiRequest } from '../services/api';

export function useRideQuote() {
  return useMutation({
    mutationFn: (input: { pickup: AddressPoint; dropoff: AddressPoint; requestedVehicleType?: string }) =>
      apiRequest<RideQuote>('/rides/quote', {
        method: 'POST',
        body: JSON.stringify(input)
      })
  });
}

export function useCreateRide() {
  return useMutation({
    mutationFn: (input: {
      pickup: AddressPoint;
      dropoff: AddressPoint;
      requestedVehicleType?: string;
      paymentMethod?: 'MTN_MOMO' | 'PAYSTACK_CARD' | 'WALLET' | 'CASH_ON_DELIVERY';
    }) =>
      apiRequest<RideTripSummary>('/rides', {
        method: 'POST',
        body: JSON.stringify(input)
      })
  });
}
