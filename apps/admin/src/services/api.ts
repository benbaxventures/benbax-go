import { API_BASE_URL, describeApiUrl } from './config';

// Mirrors packages/shared/src/api.ts's ApiResponse. Duplicated locally so this
// app builds standalone when deployed from a subdirectory-only checkout.
type ApiResponse<T> =
  | { ok: true; data: T; meta?: Record<string, unknown> }
  | { ok: false; error: { message: string; code?: string } };

/**
 * Thrown when the request never reached the API — DNS, TLS, CORS, an offline
 * browser, or a host that isn't listening. `fetch` reports all of these as a
 * bare TypeError ("NetworkError when attempting to fetch resource"), which
 * tells an operator nothing, so it is re-thrown naming the URL that failed.
 */
export class ApiUnreachableError extends Error {
  readonly url: string;

  constructor(url: string, timedOut = false) {
    super(
      timedOut
        ? `The Benbax API at ${url} did not respond in time. Please try again.`
        : `Can't reach the Benbax API at ${url}. Check your connection and try again.`
    );
    this.name = 'ApiUnreachableError';
    this.url = url;
  }
}

/**
 * Ceiling on a single request. Generous on purpose: the API sleeps when idle
 * and its first request after a cold start routinely takes 30–60 seconds. The
 * timeout exists so a genuinely dead connection eventually says so instead of
 * spinning forever, not to cut a cold start short.
 */
const REQUEST_TIMEOUT_MS = 90_000;

/** Runs a fetch with a timeout, converting transport failures into ApiUnreachableError. */
async function fetchApi(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${API_BASE_URL}${path}`, { ...init, signal: controller.signal });
  } catch {
    throw new ApiUnreachableError(describeApiUrl(path), controller.signal.aborted);
  } finally {
    clearTimeout(timer);
  }
}

const STORAGE_KEYS = {
  accessToken: 'benbax.admin.accessToken',
  refreshToken: 'benbax.admin.refreshToken',
  user: 'benbax.admin.user',
} as const;

/**
 * A failure the API described in its own envelope, or one we classified from
 * the status when it could not. Carrying the status and code (rather than a
 * bare string) is what lets the dashboard tell an expired session from a rate
 * limit from a server fault.
 */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    status: number,
    code: string | null = null,
    retryAfterSeconds: number | null = null
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function parseRetryAfter(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return seconds;
    const date = Date.parse(header);
    if (!Number.isNaN(date)) return Math.max(0, Math.round((date - Date.now()) / 1_000));
  }
  const reset = Number(response.headers.get('ratelimit-reset'));
  return Number.isFinite(reset) ? reset : null;
}

/**
 * The API's envelope, or null when the body was something else — an HTML error
 * page from a proxy in front of it, or nothing at all. The status still says
 * what happened, so it is kept rather than replaced with "invalid JSON".
 */
async function readApiResponse<T>(response: Response): Promise<ApiResponse<T> | null> {
  const text = await response.text();
  if (!text.trim()) return null;

  try {
    const parsed = JSON.parse(text) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { ok?: unknown }).ok === 'boolean'
    ) {
      return parsed as ApiResponse<T>;
    }
  } catch {
    // Fall through: not our envelope.
  }
  console.warn(`[api] unreadable ${response.status} response`, text.slice(0, 300));
  return null;
}

/** What an operator should read for a given failure. */
export function describeApiError(
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  if (error instanceof ApiUnreachableError) return error.message;
  if (error instanceof ApiRequestError) {
    if (error.status === 429) {
      const wait = error.retryAfterSeconds;
      return wait && wait > 0
        ? `Too many requests. Please wait ${wait < 60 ? `${Math.ceil(wait)} seconds` : 'a minute'} and try again.`
        : 'Too many requests. Please wait a moment and try again.';
    }
    if (error.status === 401) return 'Your session has expired. Please sign in again.';
    if (error.status >= 500 || error.code === 'INVALID_RESPONSE') {
      return 'Something went wrong on our server. Please try again shortly.';
    }
    if (error.status === 403) return 'You do not have permission to do that.';
    return error.message || fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

// Single-flight so a burst of concurrent 401s triggers only one refresh call.
let refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshTokens(): Promise<boolean> {
  const refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken);
  if (!refreshToken) return false;

  try {
    const response = await fetchApi('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const body = await readApiResponse<{
      tokens: { accessToken: string; refreshToken: string };
    }>(response);
    if (!response.ok || !body || !body.ok) return false;

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

  const response = await fetchApi(path, { ...options, headers });

  // Access tokens expire every 15 minutes; transparently refresh and retry
  // once instead of surfacing "Invalid or expired token" to the operator.
  if (response.status === 401 && !isRetryAfterRefresh && !path.startsWith('/auth/')) {
    refreshInFlight ??= tryRefreshTokens().finally(() => {
      refreshInFlight = null;
    });
    const refreshed = await refreshInFlight;
    if (refreshed) return apiRequest<T>(path, options, true);

    clearSessionAndReload();
    throw new ApiRequestError(
      'Your session has expired. Please sign in again.',
      401,
      'UNAUTHORIZED'
    );
  }

  const retryAfterSeconds = parseRetryAfter(response);
  const body = await readApiResponse<T>(response);

  if (!body) {
    throw new ApiRequestError(
      `The server sent an unreadable response (HTTP ${response.status}).`,
      response.status,
      response.status === 429 ? 'RATE_LIMITED' : 'INVALID_RESPONSE',
      retryAfterSeconds
    );
  }

  if (!response.ok || !body.ok) {
    const message = body.ok ? 'Request failed' : body.error.message;
    const code = body.ok ? null : (body.error.code ?? null);
    throw new ApiRequestError(message, response.status, code, retryAfterSeconds);
  }

  return body.data;
}
