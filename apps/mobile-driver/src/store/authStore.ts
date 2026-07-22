import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { apiRequest, setUnauthorizedHandler } from '../services/api';

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
  onboardingComplete: boolean;
  hasSeenWelcome: boolean;
  completeWelcome: () => Promise<void>;
  login: (phone: string, password: string, rememberMe?: boolean) => Promise<void>;
  loginWithGoogle: (
    tokens: { accessToken?: string; idToken?: string; role?: 'RIDER' | 'DRIVER' },
    rememberMe?: boolean
  ) => Promise<void>;
  register: (input: {
    name: string;
    phone: string;
    email: string;
    password: string;
    role: 'RIDER' | 'DRIVER';
  }) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  updateUser: (updated: Partial<DriverUser>) => Promise<void>;
  completeOnboarding: () => Promise<void>;
};

const ONBOARDING_KEY = 'benbax.driver.onboardingComplete';
const WELCOME_KEY = 'benbax.driver.hasSeenWelcome';

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isHydrating: true,
  onboardingComplete: false,
  hasSeenWelcome: false,

  async completeWelcome() {
    await AsyncStorage.setItem(WELCOME_KEY, 'true');
    set({ hasSeenWelcome: true });
  },

  async login(phone, password, rememberMe = true) {
    const data = await apiRequest<{
      user: DriverUser;
      tokens: { accessToken: string; refreshToken: string };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
      skipAuth: true,
    });
    await AsyncStorage.multiSet([
      ['benbax.driver.accessToken', data.tokens.accessToken],
      ['benbax.driver.refreshToken', data.tokens.refreshToken],
      ['benbax.driver.user', JSON.stringify(data.user)],
      ['benbax.driver.rememberMe', rememberMe ? 'true' : 'false'],
    ]);
    // Check if onboarding was already completed for this user
    const storedOnboarding = await AsyncStorage.getItem(ONBOARDING_KEY);
    const onboardingComplete = storedOnboarding === 'true';
    set({ user: data.user, onboardingComplete });
  },

  async loginWithGoogle(tokens, rememberMe = true) {
    const data = await apiRequest<{
      user: DriverUser;
      tokens: { accessToken: string; refreshToken: string };
    }>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ ...tokens, role: tokens.role ?? 'DRIVER' }),
      skipAuth: true,
    });
    await AsyncStorage.multiSet([
      ['benbax.driver.accessToken', data.tokens.accessToken],
      ['benbax.driver.refreshToken', data.tokens.refreshToken],
      ['benbax.driver.user', JSON.stringify(data.user)],
      ['benbax.driver.rememberMe', rememberMe ? 'true' : 'false'],
    ]);
    const storedOnboarding = await AsyncStorage.getItem(ONBOARDING_KEY);
    const onboardingComplete = storedOnboarding === 'true';
    set({ user: data.user, onboardingComplete });
  },

  async register(input) {
    const data = await apiRequest<{
      user: DriverUser;
      tokens: { accessToken: string; refreshToken: string };
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
      skipAuth: true,
    });
    await AsyncStorage.multiSet([
      ['benbax.driver.accessToken', data.tokens.accessToken],
      ['benbax.driver.refreshToken', data.tokens.refreshToken],
      ['benbax.driver.user', JSON.stringify(data.user)],
      ['benbax.driver.rememberMe', 'true'],
    ]);
    // New registration → onboarding not yet completed
    set({ user: data.user, onboardingComplete: false });
  },

  async hydrate() {
    const entries = await AsyncStorage.multiGet([
      'benbax.driver.user',
      'benbax.driver.rememberMe',
      ONBOARDING_KEY,
      WELCOME_KEY,
    ]);
    const rawUser = entries[0]?.[1];
    const rememberMe = entries[1]?.[1];
    const storedOnboarding = entries[2]?.[1];
    const storedWelcome = entries[3]?.[1];
    const shouldRestore = rememberMe !== 'false';
    const onboardingComplete = storedOnboarding === 'true';
    set({
      user: shouldRestore && rawUser ? JSON.parse(rawUser) : null,
      isHydrating: false,
      onboardingComplete: shouldRestore ? onboardingComplete : false,
      hasSeenWelcome: storedWelcome === 'true',
    });
  },

  async logout() {
    await AsyncStorage.multiRemove([
      'benbax.driver.accessToken',
      'benbax.driver.refreshToken',
      'benbax.driver.user',
      'benbax.driver.rememberMe',
      ONBOARDING_KEY,
      'benbax.driver.onboardingProgress',
      'benbax.driver.onboardingPendingCapture',
    ]);
    set({ user: null, onboardingComplete: false });
  },

  async updateUser(updated) {
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) return;
    const nextUser = { ...currentUser, ...updated };
    await AsyncStorage.setItem('benbax.driver.user', JSON.stringify(nextUser));
    set({ user: nextUser });
  },

  async completeOnboarding() {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    set({ onboardingComplete: true });
  },
}));

// When both access and refresh tokens are rejected, drop the in-memory session
// so the app routes back to sign-in instead of looping on 401s.
setUnauthorizedHandler(() => {
  useAuthStore.setState({ user: null });
});
