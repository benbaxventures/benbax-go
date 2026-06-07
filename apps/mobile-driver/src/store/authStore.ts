import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { apiRequest } from '../services/api';

type DriverUser = {
  id: string;
  name: string;
  phone: string;
  role: string;
  email?: string;
};

type AuthState = {
  user: DriverUser | null;
  isHydrating: boolean;
  login: (phone: string, password: string, rememberMe?: boolean) => Promise<void>;
  loginWithGoogle: (tokens: { accessToken?: string; idToken?: string; role?: 'RIDER' | 'DRIVER' }, rememberMe?: boolean) => Promise<void>;
  register: (input: { name: string; phone: string; password: string; role: 'RIDER' | 'DRIVER' }) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  updateUser: (updated: Partial<DriverUser>) => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isHydrating: true,
  async login(phone, password, rememberMe = true) {
    const data = await apiRequest<{ user: DriverUser; tokens: { accessToken: string; refreshToken: string } }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ phone, password }),
        skipAuth: true
      }
    );
    await AsyncStorage.multiSet([
      ['benbax.driver.accessToken', data.tokens.accessToken],
      ['benbax.driver.refreshToken', data.tokens.refreshToken],
      ['benbax.driver.user', JSON.stringify(data.user)],
      ['benbax.driver.rememberMe', rememberMe ? 'true' : 'false']
    ]);
    set({ user: data.user });
  },
  async loginWithGoogle(tokens, rememberMe = true) {
    const data = await apiRequest<{ user: DriverUser; tokens: { accessToken: string; refreshToken: string } }>(
      '/auth/google',
      {
        method: 'POST',
        body: JSON.stringify({ ...tokens, role: tokens.role ?? 'DRIVER' }),
        skipAuth: true
      }
    );
    await AsyncStorage.multiSet([
      ['benbax.driver.accessToken', data.tokens.accessToken],
      ['benbax.driver.refreshToken', data.tokens.refreshToken],
      ['benbax.driver.user', JSON.stringify(data.user)],
      ['benbax.driver.rememberMe', rememberMe ? 'true' : 'false']
    ]);
    set({ user: data.user });
  },
  async register(input) {
    const data = await apiRequest<{ user: DriverUser; tokens: { accessToken: string; refreshToken: string } }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(input),
        skipAuth: true
      }
    );
    await AsyncStorage.multiSet([
      ['benbax.driver.accessToken', data.tokens.accessToken],
      ['benbax.driver.refreshToken', data.tokens.refreshToken],
      ['benbax.driver.user', JSON.stringify(data.user)],
      ['benbax.driver.rememberMe', 'true']
    ]);
    set({ user: data.user });
  },
  async hydrate() {
    const entries = await AsyncStorage.multiGet(['benbax.driver.user', 'benbax.driver.rememberMe']);
    const rawUser = entries[0]?.[1];
    const rememberMe = entries[1]?.[1];
    const shouldRestore = rememberMe !== 'false';
    set({ user: shouldRestore && rawUser ? JSON.parse(rawUser) : null, isHydrating: false });
  },

  async logout() {
    await AsyncStorage.multiRemove(['benbax.driver.accessToken', 'benbax.driver.refreshToken', 'benbax.driver.user', 'benbax.driver.rememberMe']);
    set({ user: null });
  },
  async updateUser(updated) {
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) return;
    const nextUser = { ...currentUser, ...updated };
    await AsyncStorage.setItem('benbax.driver.user', JSON.stringify(nextUser));
    set({ user: nextUser });
  }
}));
