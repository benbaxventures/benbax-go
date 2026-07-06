import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

type DriverOffer = {
  id: string;
  tripId: string;
  score: number;
  expiresAt: string;
};

type HotZone = {
  id: string;
  center: { latitude: number; longitude: number };
  radius: number;
  demandLevel: 'high' | 'medium' | 'low';
  label?: string;
};

type BonusGoal = {
  id: string;
  title: string;
  target: number;
  current: number;
  reward: number;
  type: 'weekly' | 'personal';
};

type PriorityBreakdown = {
  score: number;
  level: 'Platinum' | 'Gold' | 'Silver' | 'Bronze';
  factors: Array<{ label: string; points: number; positive: boolean }>;
};

/** A passenger/customer who is currently online and looking for a ride nearby. */
export type NearbyClient = {
  id: string;
  latitude: number;
  longitude: number;
  serviceClass?: 'economy' | 'comfort' | 'premium';
  /** Optional friendly label, e.g. first name or "Passenger". */
  name?: string;
  /** Straight-line distance from the driver, in km, if the server provides it. */
  distanceKm?: number;
  /** ISO timestamp of when the client came online. */
  since?: string;
};

type Shift = {
  id: string;
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  active: boolean;
};

type DriverState = {
  isOnline: boolean;
  currentOffer: DriverOffer | null;
  earningMode: 'efficient' | 'flexible';
  maxPickupDistance: number;
  priority: PriorityBreakdown | null;
  hotZones: HotZone[];
  bonusGoals: BonusGoal[];
  headingHome: boolean;
  homeDestination: { latitude: number; longitude: number } | null;
  serviceClass: 'economy' | 'comfort' | 'premium';
  shifts: Shift[];
  newsUnreadCount: number;
  nearbyClients: NearbyClient[];
  setOnline: (isOnline: boolean) => void;
  setCurrentOffer: (offer: DriverOffer | null) => void;
  setEarningMode: (mode: 'efficient' | 'flexible') => void;
  setMaxPickupDistance: (km: number) => void;
  setPriority: (priority: PriorityBreakdown | null) => void;
  setHotZones: (zones: HotZone[]) => void;
  setBonusGoals: (goals: BonusGoal[]) => void;
  setHeadingHome: (heading: boolean) => void;
  setHomeDestination: (dest: { latitude: number; longitude: number } | null) => void;
  setServiceClass: (cls: 'economy' | 'comfort' | 'premium') => void;
  setShifts: (shifts: Shift[]) => void;
  setNewsUnreadCount: (count: number) => void;
  /** Replace the full set of nearby online clients (e.g. from a fresh fetch). */
  setNearbyClients: (clients: NearbyClient[]) => void;
  /** Add or update a single client when one comes online / moves. */
  upsertNearbyClient: (client: NearbyClient) => void;
  /** Remove a client when they go offline or get matched. */
  removeNearbyClient: (clientId: string) => void;
  /** Clear all nearby clients (e.g. on going offline). */
  clearNearbyClients: () => void;
  hydratePreferences: () => Promise<void>;
};

export const useDriverStore = create<DriverState>((set) => ({
  isOnline: false,
  currentOffer: null,
  earningMode: 'efficient',
  maxPickupDistance: 10,
  priority: null,
  hotZones: [],
  bonusGoals: [],
  headingHome: false,
  homeDestination: null,
  serviceClass: 'economy',
  shifts: [],
  newsUnreadCount: 0,
  nearbyClients: [],

  setOnline: (isOnline) => set({ isOnline }),
  setCurrentOffer: (currentOffer) => set({ currentOffer }),
  setEarningMode: (earningMode) => {
    set({ earningMode });
    AsyncStorage.setItem('benbax.driver.earningMode', earningMode);
  },
  setMaxPickupDistance: (maxPickupDistance) => {
    set({ maxPickupDistance });
    AsyncStorage.setItem('benbax.driver.maxPickupDistance', String(maxPickupDistance));
  },
  setPriority: (priority) => set({ priority }),
  setHotZones: (hotZones) => set({ hotZones }),
  setBonusGoals: (bonusGoals) => set({ bonusGoals }),
  setHeadingHome: (headingHome) => set({ headingHome }),
  setHomeDestination: (homeDestination) => set({ homeDestination }),
  setServiceClass: (serviceClass) => {
    set({ serviceClass });
    AsyncStorage.setItem('benbax.driver.serviceClass', serviceClass);
  },
  setShifts: (shifts) => set({ shifts }),
  setNewsUnreadCount: (newsUnreadCount) => set({ newsUnreadCount }),

  setNearbyClients: (nearbyClients) => set({ nearbyClients }),
  upsertNearbyClient: (client) =>
    set((state) => {
      const existing = state.nearbyClients.findIndex((c) => c.id === client.id);
      if (existing === -1) {
        return { nearbyClients: [...state.nearbyClients, client] };
      }
      const next = state.nearbyClients.slice();
      next[existing] = { ...next[existing], ...client };
      return { nearbyClients: next };
    }),
  removeNearbyClient: (clientId) =>
    set((state) => ({
      nearbyClients: state.nearbyClients.filter((c) => c.id !== clientId),
    })),
  clearNearbyClients: () => set({ nearbyClients: [] }),

  async hydratePreferences() {
    const entries = await AsyncStorage.multiGet([
      'benbax.driver.earningMode',
      'benbax.driver.maxPickupDistance',
      'benbax.driver.serviceClass',
    ]);
    const earningMode = (entries[0]?.[1] as 'efficient' | 'flexible') || 'efficient';
    const maxPickupDistance = Number(entries[1]?.[1]) || 10;
    const serviceClass = (entries[2]?.[1] as 'economy' | 'comfort' | 'premium') || 'economy';
    set({ earningMode, maxPickupDistance, serviceClass });
  },
}));
