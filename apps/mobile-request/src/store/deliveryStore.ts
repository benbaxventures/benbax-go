import type { AddressPoint, DeliveryCategory, DeliveryQuote } from '../shared';
import { create } from 'zustand';

type DeliveryDraft = {
  category: DeliveryCategory;
  pickup?: AddressPoint;
  dropoff?: AddressPoint;
  quote?: DeliveryQuote;
  notes?: string;
};

type DeliveryState = {
  draft: DeliveryDraft;
  setCategory: (category: DeliveryCategory) => void;
  setPickup: (pickup: AddressPoint) => void;
  setDropoff: (dropoff: AddressPoint) => void;
  setQuote: (quote: DeliveryQuote) => void;
  reset: () => void;
};

const initialDraft: DeliveryDraft = {
  category: 'PARCEL'
};

export const useDeliveryStore = create<DeliveryState>((set) => ({
  draft: initialDraft,
  setCategory: (category) => set((state) => ({ draft: { ...state.draft, category } })),
  setPickup: (pickup) => set((state) => ({ draft: { ...state.draft, pickup } })),
  setDropoff: (dropoff) => set((state) => ({ draft: { ...state.draft, dropoff } })),
  setQuote: (quote) => set((state) => ({ draft: { ...state.draft, quote } })),
  reset: () => set({ draft: initialDraft })
}));
