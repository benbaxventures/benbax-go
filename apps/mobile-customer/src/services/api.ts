import Constants from 'expo-constants';
import type { ApiResponse } from '@benbax/shared';
import { getAccessToken } from './authStorage';

function resolveApiBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_BASE_URL) return process.env.EXPO_PUBLIC_API_BASE_URL;

  const legacyManifest = Constants.manifest as { debuggerHost?: string } | null;
  const hostUri =
    Constants.expoConfig?.hostUri ??
    Constants.manifest2?.extra?.expoGo?.debuggerHost ??
    legacyManifest?.debuggerHost;
  const host = hostUri?.split(':')[0];

  if (host) return `http://${host}:4000/api/v1`;

  return 'http://localhost:4000/api/v1';
}

const API_BASE_URL = resolveApiBaseUrl();
const API_ORIGIN = API_BASE_URL.replace(/\/api\/v\d+\/?$/, '');

export class ApiConnectionError extends Error {
  constructor() {
    super(`Could not reach the Benbax API at ${API_BASE_URL}`);
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
  return API_BASE_URL;
}

export function isApiConnectionError(error: unknown) {
  return error instanceof ApiConnectionError;
}

export async function checkApiHealth() {
  try {
    const response = await fetch(`${API_ORIGIN}/health`);
    return response.ok;
  } catch {
    return false;
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
    response = await fetch(`${API_BASE_URL}${path}`, {
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
