import { Platform } from 'react-native';
import Constants from 'expo-constants';

function getExpoHost() {
  const legacyManifest = Constants.manifest as { debuggerHost?: string } | null;
  const hostUri =
    Constants.expoConfig?.hostUri ??
    Constants.manifest2?.extra?.expoGo?.debuggerHost ??
    legacyManifest?.debuggerHost;

  return hostUri?.split(':')[0];
}

export function resolveLocalApiOrigin() {
  const host = getExpoHost();
  if (host) return `http://${host}:4000`;

  if (Platform.OS === 'android') return 'http://10.0.2.2:4000';

  return 'http://localhost:4000';
}

export function resolveApiBaseUrl() {
  return process.env.EXPO_PUBLIC_API_BASE_URL || `${resolveLocalApiOrigin()}/api/v1`;
}

export function resolveSocketUrl() {
  return process.env.EXPO_PUBLIC_SOCKET_URL || resolveLocalApiOrigin();
}
