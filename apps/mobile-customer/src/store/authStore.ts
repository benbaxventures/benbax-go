import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { apiRequest } from '../services/api';

type User = {
  id: string;
  name: string;
  phone: string;
  role: string;
};

type AuthState = {
  user: User | null;
  isHydrating: boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (input: { name: string; phone: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isHydrating: true,
  async login(phone, password) {
    const data = await apiRequest<{ user: User; tokens: { accessToken: string; refreshToken: string } }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ phone, password }),
        skipAuth: true
      }
    );
    await AsyncStorage.multiSet([
      ['benbax.accessToken', data.tokens.accessToken],
      ['benbax.refreshToken', data.tokens.refreshToken],
      ['benbax.user', JSON.stringify(data.user)]
    ]);
    set({ user: data.user });
  },
  async register(input) {
    const data = await apiRequest<{ user: User; tokens: { accessToken: string; refreshToken: string } }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({ ...input, role: 'CUSTOMER' }),
        skipAuth: true
      }
    );
    await AsyncStorage.multiSet([
      ['benbax.accessToken', data.tokens.accessToken],
      ['benbax.refreshToken', data.tokens.refreshToken],
      ['benbax.user', JSON.stringify(data.user)]
    ]);
    set({ user: data.user });
  },
  async logout() {
    await AsyncStorage.multiRemove(['benbax.accessToken', 'benbax.refreshToken', 'benbax.user']);
    set({ user: null });
  },
  async hydrate() {
    const raw = await AsyncStorage.getItem('benbax.user');
    set({ user: raw ? JSON.parse(raw) : null, isHydrating: false });
  }
}));
