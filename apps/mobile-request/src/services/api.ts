import type { ApiResponse } from '../shared';
import { clearAuthSession, getAccessToken, getRefreshToken, saveTokens } from './authStorage';
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
    super(
      'Could not reach the Benbax server. It may be waking up from sleep — ' +
        'wait a few seconds and try again.'
    );
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
    if (response.ok) return 'online';
    if (response.status === 503) return 'database_offline';
    return 'api_offline';
  } catch {
    return 'api_offline';
  }
}

type RequestOptions = RequestInit & {
  skipAuth?: boolean;
};

// Render's free tier spins the server down after inactivity; the first request
// then has to wait for a cold start (~50s observed). Give each attempt a
// generous ceiling so a waking server still succeeds instead of hanging forever.
const REQUEST_TIMEOUT_MS = 60_000;
// Only idempotent GETs are retried automatically — retrying a POST could create
// duplicate deliveries/trips/payments. Non-GET requests get a single attempt.
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
// the sign-in screen instead of showing "Invalid or expired token" everywhere.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

// Access tokens are short-lived (15m). When one expires we exchange the stored
// refresh token for a new pair. A single shared promise coalesces concurrent
// 401s so we refresh once, not once per in-flight request.
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = await getRefreshToken();
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
        await saveTokens(body.data.tokens.accessToken, body.data.tokens.refreshToken);
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
      // Brief backoff before retrying a cold/unreachable server.
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
  }
  throw new ApiConnectionError();
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await sendRequest(path, options, await getAccessToken());

  // A 401 on an authenticated request means the access token expired. Refresh
  // once and replay — the original request never reached business logic (auth
  // middleware rejects before the handler), so replaying is safe for any method.
  if (response.status === 401 && !options.skipAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await sendRequest(path, options, await getAccessToken());
    } else {
      await clearAuthSession();
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
    const message =
      body && !body.ok && body.error && body.error.message
        ? body.error.message
        : response.statusText || 'Request failed';
    const code = body && !body.ok && body.error && body.error.code ? body.error.code : null;
    const details =
      body && !body.ok && body.error && body.error.details ? body.error.details : undefined;
    throw new ApiResponseError(message, response.status, code, details);
  }

  return body.data;
}
