import { create } from 'zustand';
import { apiRequest } from '../services/api';
import { clearAuthSession, getStoredUser, saveAuthSession } from '../services/authStorage';

type User = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  role: string;
};

type AuthState = {
  user: User | null;
  isHydrating: boolean;
  login: (phone: string, password: string, rememberMe?: boolean) => Promise<void>;
  loginWithGoogle: (tokens: { accessToken?: string; idToken?: string }, rememberMe?: boolean) => Promise<void>;
  register: (input: { name: string; phone: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isHydrating: true,
  async login(phone, password, rememberMe = true) {
    const data = await apiRequest<{ user: User; tokens: { accessToken: string; refreshToken: string } }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ phone, password }),
        skipAuth: true
      }
    );
    await saveAuthSession({ ...data.tokens, user: data.user }, rememberMe);
    set({ user: data.user });
  },
  async loginWithGoogle(tokens, rememberMe = true) {
    const data = await apiRequest<{ user: User; tokens: { accessToken: string; refreshToken: string } }>(
      '/auth/google',
      {
        method: 'POST',
        body: JSON.stringify({ ...tokens, role: 'CUSTOMER' }),
        skipAuth: true
      }
    );
    await saveAuthSession({ ...data.tokens, user: data.user }, rememberMe);
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
    await saveAuthSession({ ...data.tokens, user: data.user }, true);
    set({ user: data.user });
  },
  async logout() {
    await clearAuthSession();
    set({ user: null });
  },
  async hydrate() {
    const user = await getStoredUser();
    set({ user, isHydrating: false });
  }
}));
