import { create } from 'zustand';
import { apiRequest, setUnauthorizedHandler } from '../services/api';
import {
  clearAuthSession,
  getBiometricEnabled,
  getStoredUser,
  saveAuthSession,
  setBiometricEnabled,
  setHasRegisteredBefore,
} from '../services/authStorage';

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
  biometricEnabled: boolean;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  login: (phone: string, password: string, rememberMe?: boolean) => Promise<void>;
  loginWithGoogle: (
    tokens: { accessToken?: string; idToken?: string },
    rememberMe?: boolean
  ) => Promise<void>;
  register: (input: {
    name: string;
    phone: string;
    email: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isHydrating: true,
  biometricEnabled: false,
  async setBiometricEnabled(enabled) {
    await setBiometricEnabled(enabled);
    set({ biometricEnabled: enabled });
  },
  async login(phone, password, rememberMe = true) {
    const data = await apiRequest<{
      user: User;
      tokens: { accessToken: string; refreshToken: string };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
      skipAuth: true,
    });
    await saveAuthSession({ ...data.tokens, user: data.user }, rememberMe);
    await setHasRegisteredBefore();
    set({ user: data.user });
  },
  async loginWithGoogle(tokens, rememberMe = true) {
    const data = await apiRequest<{
      user: User;
      tokens: { accessToken: string; refreshToken: string };
    }>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ ...tokens, role: 'CUSTOMER' }),
      skipAuth: true,
    });
    await saveAuthSession({ ...data.tokens, user: data.user }, rememberMe);
    await setHasRegisteredBefore();
    set({ user: data.user });
  },
  async register(input) {
    const data = await apiRequest<{
      user: User;
      tokens: { accessToken: string; refreshToken: string };
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ ...input, role: 'CUSTOMER' }),
      skipAuth: true,
    });
    await saveAuthSession({ ...data.tokens, user: data.user }, true);
    await setHasRegisteredBefore();
    set({ user: data.user });
  },
  async logout() {
    await clearAuthSession();
    set({ user: null, biometricEnabled: false });
  },
  async hydrate() {
    const [user, biometricEnabled] = await Promise.all([getStoredUser(), getBiometricEnabled()]);
    set({ user, biometricEnabled, isHydrating: false });
  },
}));

// When both access and refresh tokens are rejected, drop the in-memory session
// so the navigator routes back to sign-in instead of looping on 401s.
setUnauthorizedHandler(() => {
  useAuthStore.setState({ user: null, biometricEnabled: false });
});
