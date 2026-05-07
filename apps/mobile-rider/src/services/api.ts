import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ApiResponse } from '@benbax/shared';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1';

type RequestOptions = RequestInit & {
  skipAuth?: boolean;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = await AsyncStorage.getItem('benbax.rider.accessToken');
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token && !options.skipAuth) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  const body = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !body.ok) {
    const message = body.ok ? 'Request failed' : body.error.message;
    throw new Error(message);
  }

  return body.data;
}
