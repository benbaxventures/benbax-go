import { create } from 'zustand';
import { apiRequest, setUnauthorizedHandler } from '../services/api';
import {
  clearAuthSession,
  getBiometricEnabled,
  getStoredUser,
  saveAuthSession,
  setBiometricEnabled,
  setHasRegisteredBefore,
  updateStoredUser,
} from '../services/authStorage';
import { normalizePhoneNumber } from '../services/contact';

type User = {
  id: string;
  name: string;
  /** Null for accounts created by Google sign-in, which carries no number. */
  phone: string | null;
  email?: string | null;
  role: string;
  /** The account has no reachable number and must supply one before riding. */
  needsPhone?: boolean;
};

type AuthState = {
  user: User | null;
  isHydrating: boolean;
  biometricEnabled: boolean;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  login: (identifier: string, password: string, rememberMe?: boolean) => Promise<void>;
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
  /** Claim a phone number for an account that signed up without one. */
  setPhone: (phone: string) => Promise<void>;
  /** Skip the phone gate for this session (API too old to accept one). */
  allowWithoutPhone: () => void;
};

/**
 * Whether this account still owes us a phone number.
 *
 * The API sends `needsPhone`, but a session stored before that field existed
 * has no such flag — and a Google account's stored phone is the raw
 * `google:<sub>` placeholder. Deriving it from the number itself catches those
 * sessions on the next launch instead of waiting for a fresh sign-in.
 */
function resolveNeedsPhone(user: User): User {
  // The stored number decides, not a remembered flag. An account signed in
  // with Google before this existed has `google:<sub>` stored and no flag at
  // all, and a stale `needsPhone: false` must never let an unreachable
  // account through — so an undialable number always re-asks.
  const unreachable = normalizePhoneNumber(user.phone) === null;
  return { ...user, needsPhone: unreachable || user.needsPhone === true };
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isHydrating: true,
  biometricEnabled: false,
  async setBiometricEnabled(enabled) {
    await setBiometricEnabled(enabled);
    set({ biometricEnabled: enabled });
  },
  async login(identifier, password, rememberMe = true) {
    const data = await apiRequest<{
      user: User;
      tokens: { accessToken: string; refreshToken: string };
    }>('/auth/login', {
      method: 'POST',
      // `identifier` may be a phone number or an email; the API resolves either.
      body: JSON.stringify({ identifier: identifier.trim(), password }),
      skipAuth: true,
    });
    await saveAuthSession({ ...data.tokens, user: data.user }, rememberMe);
    await setHasRegisteredBefore();
    set({ user: resolveNeedsPhone(data.user) });
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
    set({ user: resolveNeedsPhone(data.user) });
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
    set({ user: resolveNeedsPhone(data.user) });
  },
  async logout() {
    await clearAuthSession();
    set({ user: null, biometricEnabled: false });
  },
  async hydrate() {
    const [user, biometricEnabled] = await Promise.all([getStoredUser(), getBiometricEnabled()]);
    set({ user: user ? resolveNeedsPhone(user) : null, biometricEnabled, isHydrating: false });
  },
  async setPhone(phone) {
    const data = await apiRequest<{ phone: string }>('/users/me/phone', {
      method: 'PATCH',
      body: JSON.stringify({ phone }),
    });
    set((state) =>
      state.user ? { user: { ...state.user, phone: data.phone, needsPhone: false } } : state
    );
    const updated = useAuthStore.getState().user;
    if (updated) await updateStoredUser(updated);
  },
  /**
   * Let this session through without a number.
   *
   * Used only when the API has no phone endpoint yet — an app updated over
   * the air ahead of its server. Blocking someone behind a gate the server
   * cannot satisfy would strand them with no way out but signing out, and
   * that is worse than the missing number. Deliberately in memory only: the
   * stored account is untouched, so the gate returns on the next launch and
   * starts working the moment the API catches up.
   */
  allowWithoutPhone() {
    set((state) => (state.user ? { user: { ...state.user, needsPhone: false } } : state));
  },
}));

// When both access and refresh tokens are rejected, drop the in-memory session
// so the navigator routes back to sign-in instead of looping on 401s.
setUnauthorizedHandler(() => {
  useAuthStore.setState({ user: null, biometricEnabled: false });
});
