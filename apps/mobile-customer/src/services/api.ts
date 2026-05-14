import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import type { ApiResponse } from '@benbax/shared';

function resolveApiBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_BASE_URL) return process.env.EXPO_PUBLIC_API_BASE_URL;

  const hostUri =
    Constants.expoConfig?.hostUri ??
    Constants.manifest2?.extra?.expoGo?.debuggerHost ??
    Constants.manifest?.debuggerHost;
  const host = hostUri?.split(':')[0];

  if (host) return `http://${host}:4000/api/v1`;

  return 'http://localhost:4000/api/v1';
}

const API_BASE_URL = resolveApiBaseUrl();

type RequestOptions = RequestInit & {
  skipAuth?: boolean;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = await AsyncStorage.getItem('benbax.accessToken');
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
    throw new Error(`Network request failed. Check that the API is running and reachable at ${API_BASE_URL}`);
  }

  const body = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !body.ok) {
    const message = body.ok ? 'Request failed' : body.error.message;
    throw new Error(message);
  }

  return body.data;
}
