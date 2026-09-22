import {
  apiErrorCodes,
  userFacingApiMessage,
  userFacingMessages,
  type ApiResponse,
} from '../shared';
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
  /** Uniform with ApiResponseError so callers can treat failures alike. */
  readonly status = 0;
  readonly code = apiErrorCodes.network;

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
  /** Seconds the server asked us to wait, from its Retry-After header. */
  retryAfterSeconds?: number | null;

  constructor(
    message: string,
    status: number,
    code?: string | null,
    details?: unknown,
    retryAfterSeconds?: number | null
  ) {
    super(message);
    this.name = 'ApiResponseError';
    this.status = status;
    this.code = code ?? null;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds ?? null;
  }
}

/**
 * The sentence to show a passenger for any failure from this module.
 *
 * Screens call this instead of reading the raw error message, which is a
 * developer string. A safe, specific reason from the backend wins; a transport
 * failure or a 5xx becomes something the passenger can act on.
 */
export function describeApiError(error: unknown, fallback?: string): string {
  if (error instanceof ApiResponseError) {
    return userFacingApiMessage({
      status: error.status,
      code: error.code ?? null,
      message: error.message,
      retryAfterSeconds: error.retryAfterSeconds ?? null,
    });
  }
  if (error instanceof ApiConnectionError) {
    return userFacingApiMessage({ status: 0, code: apiErrorCodes.network });
  }
  return fallback ?? userFacingMessages.unknown;
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

export async function refreshAccessToken(): Promise<boolean> {
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

  return readBody<T>(response, path);
}

/** The API's envelope, or null when the body was something else entirely. */
function parseEnvelope<T>(text: string): ApiResponse<T> | null {
  if (text.trim().length === 0) return null;
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
    // An HTML error page from a proxy, or a truncated body.
  }
  return null;
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
 * Reads the response body once and turns it into either the payload or a
 * classified error.
 *
 * The body is read as text first because it is not always ours: a proxy in
 * front of the API answers a restart or a gateway timeout with an HTML page,
 * and an aborted response can be empty. Calling `.json()` on those throws, and
 * the old client reported every one of them as "the server returned an invalid
 * response" — losing the status code, which was the only part that said what
 * had actually gone wrong.
 */
async function readBody<T>(response: Response, path: string): Promise<T> {
  const retryAfterSeconds = parseRetryAfter(response);
  const text = await response.text().catch(() => '');
  const body = parseEnvelope<T>(text);

  if (!body) {
    logApiFailure(path, response.status, text);
    throw new ApiResponseError(
      `Unreadable response from ${path} (HTTP ${response.status})`,
      response.status,
      response.status === 429 ? apiErrorCodes.rateLimited : apiErrorCodes.invalidResponse,
      undefined,
      retryAfterSeconds
    );
  }

  if (!response.ok || !body.ok) {
    const failure = body.ok
      ? { message: response.statusText || 'Request failed', code: null, details: undefined }
      : { message: body.error.message, code: body.error.code, details: body.error.details };
    logApiFailure(path, response.status, failure.message);
    throw new ApiResponseError(
      failure.message,
      response.status,
      failure.code,
      failure.details,
      retryAfterSeconds
    );
  }

  return body.data;
}

/** Technical detail goes to the log — never to the passenger's screen. */
function logApiFailure(path: string, status: number, detail: string) {
  const summary = detail.length > 300 ? `${detail.slice(0, 300)}…` : detail;
  console.warn(`[api] ${path} failed with ${status}: ${summary}`);
}
