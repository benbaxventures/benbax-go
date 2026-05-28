import type { ApiResponse } from '@benbax/shared';
import { getAccessToken } from './authStorage';
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

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token && !options.skipAuth) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrlCached()}${path}`, {
      ...options,
      headers
    });
  } catch {
    throw new ApiConnectionError();
  }

  let body: ApiResponse<T>;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new Error('The server returned an invalid response. Check the API logs and try again.');
  }

  if (!response.ok || !body.ok) {
    const message = body && !body.ok && body.error && body.error.message ? body.error.message : response.statusText || 'Request failed';
    const code = body && !body.ok && body.error && body.error.code ? body.error.code : null;
    const details = body && !body.ok && body.error && body.error.details ? body.error.details : undefined;
    throw new ApiResponseError(message, response.status, code, details);
  }

  return body.data;
}
