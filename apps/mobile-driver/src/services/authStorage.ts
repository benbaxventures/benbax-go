import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCESS_TOKEN_KEY = 'benbax.driver.accessToken';
const REFRESH_TOKEN_KEY = 'benbax.driver.refreshToken';
const USER_KEY = 'benbax.driver.user';

type StoredUser = {
  id: string;
  name: string;
  /** Null for accounts created by Google sign-in, which carries no number. */
  phone: string | null;
  email?: string | null;
  role: string;
  /** The account has no reachable number and must supply one. */
  needsPhone?: boolean;
};

export async function getAccessToken() {
  return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
}

export async function saveAuthSession(input: {
  accessToken: string;
  refreshToken: string;
  user: StoredUser;
}) {
  await Promise.all([
    AsyncStorage.setItem(ACCESS_TOKEN_KEY, input.accessToken),
    AsyncStorage.setItem(REFRESH_TOKEN_KEY, input.refreshToken),
    AsyncStorage.setItem(USER_KEY, JSON.stringify(input.user)),
  ]);
}

export async function clearAuthSession() {
  await Promise.all([
    AsyncStorage.removeItem(ACCESS_TOKEN_KEY),
    AsyncStorage.removeItem(REFRESH_TOKEN_KEY),
    AsyncStorage.removeItem(USER_KEY),
  ]);
}

export async function getStoredUser() {
  const raw = await AsyncStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as StoredUser) : null;
}

export async function updateStoredUser(user: StoredUser) {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}
