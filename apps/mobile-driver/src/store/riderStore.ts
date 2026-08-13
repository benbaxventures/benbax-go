import { create } from 'zustand';
import type { OfferPoint } from './driverStore';

type DeliveryOffer = {
  id: string;
  deliveryId: string;
  score: number;
  expiresAt: string;
  /** Name of the customer who requested the delivery, when the API provides it. */
  customerName?: string;
  pickup?: OfferPoint;
  dropoff?: OfferPoint;
};

type RiderState = {
  isOnline: boolean;
  currentOffer: DeliveryOffer | null;
  setOnline: (isOnline: boolean) => void;
  setCurrentOffer: (offer: DeliveryOffer | null) => void;
};

export const useRiderStore = create<RiderState>((set) => ({
  isOnline: false,
  currentOffer: null,
  setOnline: (isOnline) => set({ isOnline }),
  setCurrentOffer: (currentOffer) => set({ currentOffer }),
}));
