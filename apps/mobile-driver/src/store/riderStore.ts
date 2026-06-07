import { create } from 'zustand';

type DeliveryOffer = {
  id: string;
  deliveryId: string;
  score: number;
  expiresAt: string;
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
