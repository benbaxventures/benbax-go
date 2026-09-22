import {
  apiErrorCodes,
  userFacingApiMessage,
  userFacingMessages,
  type ApiResponse,
} from '@benbax/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveApiBaseUrl } from './network';
import { captureException } from './sentry';

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
    super(`Could not reach the Benbax API at ${getApiBaseUrlCached()}`);
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

export function getApiBaseUrl() {
  return getApiBaseUrlCached();
}

export function isApiConnectionError(error: unknown) {
  return error instanceof ApiConnectionError;
}

/**
 * The sentence to show a driver for any failure from this module.
 *
 * Screens call this instead of reading `error.message`, which is a developer
 * string: it may name our host, or be a transport failure that means nothing
 * to the person holding the phone. The backend's own reason is preferred
 * whenever it is safe and specific — that is where "Finish your current trip
 * before accepting another" comes from.
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
  /**
   * Background polling. These are dropped (rather than queued or retried)
   * while the server has told us to back off, so a refresh loop can never turn
   * a single 429 into a sustained one.
   */
  background?: boolean;
};

const ACCESS_TOKEN_KEY = 'benbax.driver.accessToken';
const REFRESH_TOKEN_KEY = 'benbax.driver.refreshToken';

// Render's free tier cold-starts (~50s) after idle; give each attempt a generous
// ceiling so a waking server still succeeds instead of hanging forever.
const REQUEST_TIMEOUT_MS = 60_000;
// Retry only idempotent GETs automatically — replaying a POST could duplicate
// trips/deliveries. Non-GET requests get a single attempt.
const GET_RETRY_ATTEMPTS = 2;
/** Used when the server sends a 429 without a Retry-After header. */
const DEFAULT_BACKOFF_SECONDS = 30;
/** Never sit out longer than this, however large Retry-After is. */
const MAX_BACKOFF_SECONDS = 300;

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

// --- rate-limit backoff ----------------------------------------------------
// When the server refuses a request, every caller respects the same pause. The
// alternative — each screen retrying on its own schedule — is what turns one
// 429 into a stream of them.
let backoffUntil = 0;

function startBackoff(seconds: number | null) {
  const wait = Math.min(Math.max(seconds ?? DEFAULT_BACKOFF_SECONDS, 1), MAX_BACKOFF_SECONDS);
  backoffUntil = Math.max(backoffUntil, Date.now() + wait * 1_000);
}

/** Seconds left before background polling resumes, or 0 when clear. */
export function rateLimitCooldownSeconds() {
  const remaining = backoffUntil - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1_000) : 0;
}

function parseRetryAfter(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return seconds;
    const date = Date.parse(header);
    if (!Number.isNaN(date)) return Math.max(0, Math.round((date - Date.now()) / 1_000));
  }
  // Draft RateLimit headers carry the same information.
  const reset = Number(response.headers.get('ratelimit-reset'));
  return Number.isFinite(reset) ? reset : null;
}

// Access tokens are short-lived (15m). A single shared promise coalesces
// concurrent 401s so we exchange the refresh token once, not once per request.
let refreshPromise: Promise<boolean> | null = null;

export async function refreshAccessToken(): Promise<boolean> {
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
  if (response.status === 429) startBackoff(retryAfterSeconds);

  const text = await response.text().catch(() => '');
  const body = parseEnvelope<T>(text);

  if (!body) {
    // Not our envelope: an infrastructure error page, or nothing at all.
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

/** Technical detail goes to the logs and Sentry — never to the driver's screen. */
function logApiFailure(path: string, status: number, detail: string) {
  const summary = detail.length > 300 ? `${detail.slice(0, 300)}…` : detail;
  console.warn(`[api] ${path} failed with ${status}: ${summary}`);
  if (status >= 500 || status === 0) {
    captureException(new Error(`API ${status} on ${path}`), { path, status, detail: summary });
  }
}

// --- in-flight de-duplication ----------------------------------------------
// Several screens and hooks can want the same list at the same moment (a
// reconnect resync landing on top of the periodic refresh, two mounted copies
// of a hook). They share one request instead of each making their own.
const inFlightGets = new Map<string, Promise<unknown>>();

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();

  if (options.background && rateLimitCooldownSeconds() > 0) {
    throw new ApiResponseError(
      'Skipped while backing off after a rate limit',
      429,
      apiErrorCodes.rateLimited,
      undefined,
      rateLimitCooldownSeconds()
    );
  }

  if (method !== 'GET') return performRequest<T>(path, options);

  const key = `${path}|${options.skipAuth ? 'anon' : 'auth'}`;
  const existing = inFlightGets.get(key);
  if (existing) return existing as Promise<T>;

  const pending = performRequest<T>(path, options).finally(() => {
    inFlightGets.delete(key);
  });
  inFlightGets.set(key, pending);
  return pending;
}

async function performRequest<T>(path: string, options: RequestOptions): Promise<T> {
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

  return readBody<T>(response, path);
}
