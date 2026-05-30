import Constants from 'expo-constants';

const API_PORT = 4000;
const DEFAULT_API_BASE_URL = 'https://benbaxapi-production.up.railway.app:8080/api/v1';
const DEFAULT_SOCKET_URL = 'https://benbaxapi-production.up.railway.app:8080';

function getExpoHost() {
  try {
    const legacyManifest = Constants.manifest as { debuggerHost?: string } | null;
    const hostUri =
      Constants.expoConfig?.hostUri ??
      Constants.manifest2?.extra?.expoGo?.debuggerHost ??
      legacyManifest?.debuggerHost;

    return hostUri?.split(':')[0] ?? null;
  } catch {
    return null;
  }
}

function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isPrivateLanHost(hostname: string) {
  return (
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  );
}

function shouldUseExpoHost(configuredUrl: string | undefined, expoHost: string | null) {
  if (!expoHost) return false;
  if (!configuredUrl) return false;

  try {
    const configuredHost = new URL(configuredUrl).hostname;

    if (isLocalHost(configuredHost)) return true;
    if (isPrivateLanHost(configuredHost) && configuredHost !== expoHost) return true;
  } catch {
    return true;
  }

  return false;
}

export function resolveApiBaseUrl() {
  const expoHost = getExpoHost();

  if (shouldUseExpoHost(process.env.EXPO_PUBLIC_API_BASE_URL, expoHost) && expoHost) {
    return `http://${expoHost}:${API_PORT}/api/v1`;
  }

  return process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
}

export function resolveSocketUrl() {
  const expoHost = getExpoHost();

  if (shouldUseExpoHost(process.env.EXPO_PUBLIC_SOCKET_URL, expoHost) && expoHost) {
    return `http://${expoHost}:${API_PORT}`;
  }

  return process.env.EXPO_PUBLIC_SOCKET_URL ?? DEFAULT_SOCKET_URL;
}
