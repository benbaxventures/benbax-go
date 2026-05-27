import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCESS_TOKEN_KEY = 'benbax.accessToken';
const REFRESH_TOKEN_KEY = 'benbax.refreshToken';
const USER_KEY = 'benbax.user';
const REMEMBER_ME_KEY = 'benbax.rememberMe';

type StoredUser = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  role: string;
};

export async function getAccessToken() {
  return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
}

export async function saveAuthSession(input: {
  accessToken: string;
  refreshToken: string;
  user: StoredUser;
}, rememberMe = true) {
  await Promise.all([
    AsyncStorage.setItem(ACCESS_TOKEN_KEY, input.accessToken),
    AsyncStorage.setItem(REFRESH_TOKEN_KEY, input.refreshToken),
    AsyncStorage.setItem(USER_KEY, JSON.stringify(input.user)),
    AsyncStorage.setItem(REMEMBER_ME_KEY, rememberMe ? 'true' : 'false')
  ]);
}

export async function clearAuthSession() {
  await Promise.all([
    AsyncStorage.removeItem(ACCESS_TOKEN_KEY),
    AsyncStorage.removeItem(REFRESH_TOKEN_KEY),
    AsyncStorage.removeItem(USER_KEY),
    AsyncStorage.removeItem(REMEMBER_ME_KEY)
  ]);
}

export async function getStoredUser() {
  const [userRaw, rememberMe] = await Promise.all([
    AsyncStorage.getItem(USER_KEY),
    AsyncStorage.getItem(REMEMBER_ME_KEY)
  ]);
  if (rememberMe === 'false') return null;
  return userRaw ? (JSON.parse(userRaw) as StoredUser) : null;
}

export async function updateStoredUser(user: StoredUser) {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}
