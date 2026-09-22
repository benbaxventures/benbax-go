import { create } from 'zustand';
import { apiRequest } from '../services/api';

type AdminUser = {
  id: string;
  name: string;
  /** Null for accounts created by Google sign-in, which hold no real number. */
  phone: string | null;
  email?: string | null;
  role: string;
  /** Back-office access, held independently of `role`. Null for non-staff. */
  staffRole?: string | null;
};

type AdminSession = {
  user: AdminUser | null;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
};

const STORAGE_KEYS = {
  accessToken: 'benbax.admin.accessToken',
  refreshToken: 'benbax.admin.refreshToken',
  user: 'benbax.admin.user',
} as const;

/**
 * Roles allowed into this dashboard. The API enforces the same list on every
 * /admin route; checking it here too means a passenger or driver signing in by
 * mistake gets told why instead of an empty screen of failed requests.
 */
export const STAFF_ROLES = ['ADMIN', 'OPERATIONS', 'SUPPORT'];

function isStaffRole(role: string | undefined | null): boolean {
  return typeof role === 'string' && STAFF_ROLES.includes(role);
}

/**
 * Whether an account may use this dashboard.
 *
 * Staff access lives in `staffRole`, separate from the operational `role`, so
 * one account can be a working driver in the partner app and an admin here.
 * Either field granting access is enough — `role` alone still covers the
 * staff-only accounts that predate the split.
 */
export function canUseDashboard(user: Pick<AdminUser, 'role' | 'staffRole'>): boolean {
  return isStaffRole(user.staffRole) || isStaffRole(user.role);
}

/** Reads the stored session, ignoring anything corrupt or no longer staff. */
function restoreUser(): AdminUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.user);
    if (!raw) return null;
    const user = JSON.parse(raw) as AdminUser;
    return user && canUseDashboard(user) ? user : null;
  } catch {
    return null;
  }
}

function clearStoredSession() {
  for (const key of Object.values(STORAGE_KEYS)) localStorage.removeItem(key);
}

export const useAdminSession = create<AdminSession>((set) => ({
  user: restoreUser(),
  async login(identifier, password) {
    const data = await apiRequest<{
      user: AdminUser;
      tokens: { accessToken: string; refreshToken: string };
    }>('/auth/login', {
      method: 'POST',
      // `identifier` accepts a phone or an email; the API resolves either.
      body: JSON.stringify({ identifier: identifier.trim(), password }),
    });

    if (!canUseDashboard(data.user)) {
      clearStoredSession();
      throw new Error(
        `This ${data.user.role.toLowerCase()} account does not have Benbax staff access. ` +
          'Ask an admin to grant it, or sign in with a staff account.'
      );
    }

    localStorage.setItem(STORAGE_KEYS.accessToken, data.tokens.accessToken);
    localStorage.setItem(STORAGE_KEYS.refreshToken, data.tokens.refreshToken);
    localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(data.user));
    set({ user: data.user });
  },
  logout() {
    clearStoredSession();
    set({ user: null });
  },
}));
