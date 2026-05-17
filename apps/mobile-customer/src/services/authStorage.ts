import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'benbax.accessToken';
const REFRESH_TOKEN_KEY = 'benbax.refreshToken';
const USER_KEY = 'benbax.user';

type StoredUser = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  role: string;
};

export async function getAccessToken() {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function saveAuthSession(input: {
  accessToken: string;
  refreshToken: string;
  user: StoredUser;
}) {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, input.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, input.refreshToken),
    AsyncStorage.setItem(USER_KEY, JSON.stringify(input.user))
  ]);
}

export async function clearAuthSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    AsyncStorage.removeItem(USER_KEY)
  ]);
}

export async function getStoredUser() {
  const raw = await AsyncStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as StoredUser) : null;
}
