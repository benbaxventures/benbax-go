import type { ApiResponse } from '@benbax/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveApiBaseUrl } from './network';

let _apiBaseUrl: string | null = null;
let _apiOrigin: string | null = null;

function getApiBaseUrlCached() {
  if (!_apiBaseUrl) _apiBaseUrl = resolveApiBaseUrl();
  return _apiBaseUrl;
}

function getApiOriginCached() {
  if (!_apiOrigin) _apiOrigin = getApiBaseUrlCached().replace(/\/api\/v\d+\/?$/, '');
  return _apiOrigin;
}

export class ApiConnectionError extends Error {
  constructor() {
    super(`Could not reach the Benbax API at ${getApiBaseUrlCached()}`);
    this.name = 'ApiConnectionError';
  }
}

export class ApiResponseError extends Error {
  status: number;
  code?: string | null;
  details?: unknown;

  constructor(message: string, status: number, code?: string | null, details?: unknown) {
    super(message);
    this.name = 'ApiResponseError';
    this.status = status;
    this.code = code ?? null;
    this.details = details;
  }
}

export function getApiBaseUrl() {
  return getApiBaseUrlCached();
}

export function isApiConnectionError(error: unknown) {
  return error instanceof ApiConnectionError;
}

export async function checkApiHealth() {
  try {
    const response = await fetch(`${getApiOriginCached()}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

type RequestOptions = RequestInit & {
  skipAuth?: boolean;
};

const ACCESS_TOKEN_KEY = 'benbax.driver.accessToken';
const REFRESH_TOKEN_KEY = 'benbax.driver.refreshToken';

// Render's free tier cold-starts (~50s) after idle; give each attempt a generous
// ceiling so a waking server still succeeds instead of hanging forever.
const REQUEST_TIMEOUT_MS = 60_000;
// Retry only idempotent GETs automatically — replaying a POST could duplicate
// trips/deliveries. Non-GET requests get a single attempt.
const GET_RETRY_ATTEMPTS = 2;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Called when the refresh token is also rejected — lets the app drop back to
// sign-in instead of showing "Invalid or expired token" everywhere.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

// Access tokens are short-lived (15m). A single shared promise coalesces
// concurrent 401s so we exchange the refresh token once, not once per request.
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
      if (!refreshToken) return false;
      try {
        const response = await fetchWithTimeout(`${getApiBaseUrlCached()}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        const body = (await response.json()) as ApiResponse<{
          tokens: { accessToken: string; refreshToken: string };
        }>;
        if (!response.ok || !body.ok) return false;
        await AsyncStorage.multiSet([
          [ACCESS_TOKEN_KEY, body.data.tokens.accessToken],
          [REFRESH_TOKEN_KEY, body.data.tokens.refreshToken],
        ]);
        return true;
      } catch {
        return false;
      }
    })();
    refreshPromise.finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function sendRequest(
  path: string,
  options: RequestOptions,
  accessToken: string | null
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (accessToken && !options.skipAuth) headers.set('Authorization', `Bearer ${accessToken}`);

  const method = (options.method ?? 'GET').toUpperCase();
  const maxAttempts = method === 'GET' ? GET_RETRY_ATTEMPTS : 1;
  const url = `${getApiBaseUrlCached()}${path}`;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchWithTimeout(url, { ...options, headers });
    } catch {
      if (attempt >= maxAttempts) throw new ApiConnectionError();
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
  }
  throw new ApiConnectionError();
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await sendRequest(path, options, await AsyncStorage.getItem(ACCESS_TOKEN_KEY));

  // A 401 means the access token expired. Refresh once and replay — the original
  // request never reached business logic (auth middleware rejects first), so
  // replaying is safe for any method.
  if (response.status === 401 && !options.skipAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await sendRequest(path, options, await AsyncStorage.getItem(ACCESS_TOKEN_KEY));
    } else {
      await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
      onUnauthorized?.();
    }
  }

  let body: ApiResponse<T>;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new Error('The server returned an invalid response. Check the API logs and try again.');
  }

  if (!response.ok || !body.ok) {
    const message = body.ok ? response.statusText || 'Request failed' : body.error.message;
    const code = body.ok ? null : body.error.code;
    const details = body.ok ? undefined : body.error.details;
    throw new ApiResponseError(message, response.status, code, details);
  }

  return body.data;
}
