import { create } from 'zustand';

type DriverOffer = {
  id: string;
  tripId: string;
  score: number;
  expiresAt: string;
};

type DriverState = {
  isOnline: boolean;
  currentOffer: DriverOffer | null;
  setOnline: (isOnline: boolean) => void;
  setCurrentOffer: (offer: DriverOffer | null) => void;
};

export const useDriverStore = create<DriverState>((set) => ({
  isOnline: false,
  currentOffer: null,
  setOnline: (isOnline) => set({ isOnline }),
  setCurrentOffer: (currentOffer) => set({ currentOffer })
}));
