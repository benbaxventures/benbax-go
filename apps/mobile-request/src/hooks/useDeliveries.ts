import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../services/api';
import type { AddressPoint, DeliveryCategory, DeliveryQuote, DeliverySummary } from '../shared';

type RawDeliveryResponse = {
  id: string;
  trackingCode: string;
  category: DeliveryCategory;
  status: string;
  pickupLabel: string;
  pickupAddress: string | null;
  pickupLatitude: string;
  pickupLongitude: string;
  pickupLandmark: string | null;
  pickupVoiceNoteUrl: string | null;
  pickupWhatsappUrl: string | null;
  dropoffLabel: string;
  dropoffAddress: string | null;
  dropoffLatitude: string;
  dropoffLongitude: string;
  dropoffLandmark: string | null;
  dropoffVoiceNoteUrl: string | null;
  dropoffWhatsappUrl: string | null;
  distanceKm: string;
  etaMinutes: number;
  baseFare: string;
  serviceFee: string;
  surgeMultiplier: string;
  totalFare: string;
  scheduledFor: string | null;
  createdAt: string;
  [key: string]: unknown;
};

function mapAddressPoint(
  label: string,
  address: string | null,
  latitude: string,
  longitude: string,
  landmark: string | null,
  voiceNoteUrl: string | null,
  whatsappUrl: string | null
): AddressPoint {
  return {
    label,
    latitude: Number(latitude),
    longitude: Number(longitude),
    ...(address ? { formattedAddress: address } : {}),
    ...(landmark ? { landmark } : {}),
    ...(voiceNoteUrl ? { voiceNoteUrl } : {}),
    ...(whatsappUrl ? { whatsappLocationUrl: whatsappUrl } : {}),
  };
}

function mapDelivery(raw: RawDeliveryResponse): DeliverySummary {
  const quote: DeliveryQuote = {
    distanceKm: Number(raw.distanceKm),
    estimatedMinutes: raw.etaMinutes,
    baseFare: Number(raw.baseFare),
    surgeMultiplier: Number(raw.surgeMultiplier),
    serviceFee: Number(raw.serviceFee),
    total: Number(raw.totalFare),
    currency: 'GHS',
  };

  return {
    id: raw.id,
    trackingCode: raw.trackingCode,
    category: raw.category,
    status: raw.status as DeliverySummary['status'],
    pickup: mapAddressPoint(
      raw.pickupLabel,
      raw.pickupAddress,
      raw.pickupLatitude,
      raw.pickupLongitude,
      raw.pickupLandmark,
      raw.pickupVoiceNoteUrl,
      raw.pickupWhatsappUrl
    ),
    dropoff: mapAddressPoint(
      raw.dropoffLabel,
      raw.dropoffAddress,
      raw.dropoffLatitude,
      raw.dropoffLongitude,
      raw.dropoffLandmark,
      raw.dropoffVoiceNoteUrl,
      raw.dropoffWhatsappUrl
    ),
    quote,
    ...(raw.scheduledFor ? { scheduledFor: raw.scheduledFor } : {}),
    createdAt: raw.createdAt,
  };
}

export function useDeliveryQuote() {
  return useMutation({
    mutationFn: (input: {
      category: DeliveryCategory;
      pickup: AddressPoint;
      dropoff: AddressPoint;
    }) =>
      apiRequest<DeliveryQuote>('/deliveries/quote', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
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
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deliveries'] }),
  });
}

export function useDeliveries() {
  return useQuery({
    queryKey: ['deliveries'],
    queryFn: async () => {
      const raw = await apiRequest<RawDeliveryResponse[]>('/deliveries');
      return raw.map(mapDelivery);
    },
  });
}
