import { create } from 'zustand';
import type { AddressPoint, RideQuote } from '../shared';

type RideDraft = {
  vehicleType: string;
  pickup?: AddressPoint;
  dropoff?: AddressPoint;
  quote?: RideQuote;
};

type RideState = {
  draft: RideDraft;
  setVehicleType: (vehicleType: string) => void;
  setPickup: (pickup: AddressPoint) => void;
  setDropoff: (dropoff: AddressPoint) => void;
  setQuote: (quote: RideQuote) => void;
  reset: () => void;
};

const initialDraft: RideDraft = {
  vehicleType: 'ECONOMY',
};

export const useRideStore = create<RideState>((set) => ({
  draft: initialDraft,
  setVehicleType: (vehicleType) => set((state) => ({ draft: { ...state.draft, vehicleType } })),
  setPickup: (pickup) => set((state) => ({ draft: { ...state.draft, pickup } })),
  setDropoff: (dropoff) => set((state) => ({ draft: { ...state.draft, dropoff } })),
  setQuote: (quote) => set((state) => ({ draft: { ...state.draft, quote } })),
  reset: () => set({ draft: initialDraft }),
}));
