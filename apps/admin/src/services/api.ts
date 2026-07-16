import type { ApiResponse } from '@benbax/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

const STORAGE_KEYS = {
  accessToken: 'benbax.admin.accessToken',
  refreshToken: 'benbax.admin.refreshToken',
  user: 'benbax.admin.user',
} as const;

// Single-flight so a burst of concurrent 401s triggers only one refresh call.
let refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshTokens(): Promise<boolean> {
  const refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken);
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const body = (await response.json()) as ApiResponse<{
      tokens: { accessToken: string; refreshToken: string };
    }>;
    if (!response.ok || !body.ok) return false;

    localStorage.setItem(STORAGE_KEYS.accessToken, body.data.tokens.accessToken);
    localStorage.setItem(STORAGE_KEYS.refreshToken, body.data.tokens.refreshToken);
    return true;
  } catch {
    return false;
  }
}

function clearSessionAndReload() {
  localStorage.removeItem(STORAGE_KEYS.accessToken);
  localStorage.removeItem(STORAGE_KEYS.refreshToken);
  localStorage.removeItem(STORAGE_KEYS.user);
  window.location.reload();
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  isRetryAfterRefresh = false
): Promise<T> {
  const token = localStorage.getItem(STORAGE_KEYS.accessToken);
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  // Access tokens expire every 15 minutes; transparently refresh and retry
  // once instead of surfacing "Invalid or expired token" to the operator.
  if (response.status === 401 && !isRetryAfterRefresh && !path.startsWith('/auth/')) {
    refreshInFlight ??= tryRefreshTokens().finally(() => {
      refreshInFlight = null;
    });
    const refreshed = await refreshInFlight;
    if (refreshed) return apiRequest<T>(path, options, true);

    clearSessionAndReload();
    throw new Error('Session expired — please sign in again');
  }

  const body = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !body.ok) {
    const message = body.ok ? 'Request failed' : body.error.message;
    throw new Error(message);
  }

  return body.data;
}
