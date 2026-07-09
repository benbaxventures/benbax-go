import { create } from 'zustand';
import type { AddressPoint, CarTripQuote } from '../shared';

type TripDraft = {
  vehicleType: string;
  pickup?: AddressPoint;
  dropoff?: AddressPoint;
  quote?: CarTripQuote;
};

type TripState = {
  draft: TripDraft;
  setVehicleType: (vehicleType: string) => void;
  setPickup: (pickup: AddressPoint) => void;
  setDropoff: (dropoff: AddressPoint) => void;
  setQuote: (quote: CarTripQuote) => void;
  reset: () => void;
};

const initialDraft: TripDraft = {
  vehicleType: 'ECONOMY',
};

export const useTripStore = create<TripState>((set) => ({
  draft: initialDraft,
  setVehicleType: (vehicleType) => set((state) => ({ draft: { ...state.draft, vehicleType } })),
  setPickup: (pickup) => set((state) => ({ draft: { ...state.draft, pickup } })),
  setDropoff: (dropoff) => set((state) => ({ draft: { ...state.draft, dropoff } })),
  setQuote: (quote) => set((state) => ({ draft: { ...state.draft, quote } })),
  reset: () => set({ draft: initialDraft }),
}));
