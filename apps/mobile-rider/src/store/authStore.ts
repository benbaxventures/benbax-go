import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { apiRequest } from '../services/api';

type RiderUser = {
  id: string;
  name: string;
  phone: string;
  role: string;
  email?: string;
};

type AuthState = {
  user: RiderUser | null;
  isHydrating: boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (input: { name: string; phone: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  updateUser: (updated: Partial<RiderUser>) => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isHydrating: true,
  async login(phone, password) {
    const data = await apiRequest<{ user: RiderUser; tokens: { accessToken: string; refreshToken: string } }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ phone, password }),
        skipAuth: true
      }
    );
    await AsyncStorage.multiSet([
      ['benbax.rider.accessToken', data.tokens.accessToken],
      ['benbax.rider.refreshToken', data.tokens.refreshToken],
      ['benbax.rider.user', JSON.stringify(data.user)]
    ]);
    set({ user: data.user });
  },
  async register(input) {
    const data = await apiRequest<{ user: RiderUser; tokens: { accessToken: string; refreshToken: string } }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({ ...input, role: 'RIDER' }),
        skipAuth: true
      }
    );
    await AsyncStorage.multiSet([
      ['benbax.rider.accessToken', data.tokens.accessToken],
      ['benbax.rider.refreshToken', data.tokens.refreshToken],
      ['benbax.rider.user', JSON.stringify(data.user)]
    ]);
    set({ user: data.user });
  },
  async logout() {
    await AsyncStorage.multiRemove(['benbax.rider.accessToken', 'benbax.rider.refreshToken', 'benbax.rider.user']);
    set({ user: null });
  },
  async hydrate() {
    const raw = await AsyncStorage.getItem('benbax.rider.user');
    set({ user: raw ? JSON.parse(raw) : null, isHydrating: false });
  },
  async updateUser(updated) {
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) return;
    const nextUser = { ...currentUser, ...updated };
    await AsyncStorage.setItem('benbax.rider.user', JSON.stringify(nextUser));
    set({ user: nextUser });
  }
}));

