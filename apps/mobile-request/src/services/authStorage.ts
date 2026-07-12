import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'benbax.accessToken';
const REFRESH_TOKEN_KEY = 'benbax.refreshToken';
const USER_KEY = 'benbax.user';
const REMEMBER_ME_KEY = 'benbax.rememberMe';
const HAS_REGISTERED_KEY = 'benbax.hasRegisteredBefore';
const BIOMETRIC_ENABLED_KEY = 'benbax.biometricEnabled';

type StoredUser = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  role: string;
};

export async function getAccessToken() {
  try {
    return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  } catch {
    return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
  }
}

export async function getRefreshToken() {
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    return AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  }
}

// Persist rotated tokens after a successful refresh, without touching the
// stored user or rememberMe flag.
export async function saveTokens(accessToken: string, refreshToken: string) {
  try {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
    ]);
  } catch {
    await Promise.all([
      AsyncStorage.setItem(ACCESS_TOKEN_KEY, accessToken),
      AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken),
    ]);
  }
}

export async function saveAuthSession(
  input: {
    accessToken: string;
    refreshToken: string;
    user: StoredUser;
  },
  rememberMe = true
) {
  try {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, input.accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, input.refreshToken),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(input.user)),
      AsyncStorage.setItem(REMEMBER_ME_KEY, rememberMe ? 'true' : 'false'),
    ]);
  } catch {
    await Promise.all([
      AsyncStorage.setItem(ACCESS_TOKEN_KEY, input.accessToken),
      AsyncStorage.setItem(REFRESH_TOKEN_KEY, input.refreshToken),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(input.user)),
      AsyncStorage.setItem(REMEMBER_ME_KEY, rememberMe ? 'true' : 'false'),
    ]);
  }
}

export async function clearAuthSession() {
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    ]);
  } catch {
    // fall through
  }
  await Promise.all([
    AsyncStorage.removeItem(ACCESS_TOKEN_KEY),
    AsyncStorage.removeItem(REFRESH_TOKEN_KEY),
    AsyncStorage.removeItem(USER_KEY),
    AsyncStorage.removeItem(REMEMBER_ME_KEY),
  ]);
}

export async function getStoredUser() {
  try {
    const [userRaw, rememberMe] = await Promise.all([
      AsyncStorage.getItem(USER_KEY),
      AsyncStorage.getItem(REMEMBER_ME_KEY),
    ]);
    if (rememberMe === 'false' || !userRaw) return null;
    const parsed = JSON.parse(userRaw);
    if (!parsed || typeof parsed !== 'object' || !parsed.id || !parsed.name) {
      await AsyncStorage.removeItem(USER_KEY).catch(() => {});
      return null;
    }
    return parsed as StoredUser;
  } catch {
    await AsyncStorage.removeItem(USER_KEY).catch(() => {});
    return null;
  }
}

export async function updateStoredUser(user: StoredUser) {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function getHasRegisteredBefore(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(HAS_REGISTERED_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setHasRegisteredBefore(): Promise<void> {
  await AsyncStorage.setItem(HAS_REGISTERED_KEY, 'true');
}

export async function getBiometricEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
}
