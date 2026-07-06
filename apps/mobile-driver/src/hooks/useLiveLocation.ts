import { useCallback, useEffect, useRef, useState } from 'react';

type LiveLocationState = {
  latitude: number;
  longitude: number;
  heading: number;
  speedKph: number;
  loading: boolean;
  error: string | null;
  permissionDenied: boolean;
  hasFix: boolean;
};

const INITIAL_STATE: LiveLocationState = {
  latitude: 0,
  longitude: 0,
  heading: 0,
  speedKph: 0,
  loading: false,
  error: null,
  permissionDenied: false,
  hasFix: false,
};

async function loadLocation() {
  try {
    return await import('expo-location');
  } catch {
    return null;
  }
}

/**
 * Continuously watches the device position (with heading) while `enabled` is
 * true — the stream that drives the live map's animated car marker. Falls back
 * gracefully when the native module or permission is unavailable.
 */
export function useLiveLocation(enabled = true) {
  const [state, setState] = useState<LiveLocationState>(INITIAL_STATE);
  const subscriptionRef = useRef<{ remove: () => void } | null>(null);

  const requestLocation = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const Location = await loadLocation();
    if (!Location) {
      setState((prev) => ({ ...prev, loading: false, error: 'Location unavailable' }));
      return null;
    }
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setState((prev) => ({
          ...prev,
          loading: false,
          permissionDenied: true,
          error: 'Location permission denied',
        }));
        return null;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const next = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setState((prev) => ({
        ...prev,
        ...next,
        loading: false,
        error: null,
        permissionDenied: false,
        hasFix: true,
      }));
      return next;
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Could not get location',
      }));
      return null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function start() {
      const Location = await loadLocation();
      if (!Location || cancelled) return;

      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted || cancelled) {
        if (!permission.granted) {
          setState((prev) => ({ ...prev, permissionDenied: true }));
        }
        return;
      }

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 10,
          timeInterval: 4_000,
        },
        (position) => {
          const rawHeading = position.coords.heading;
          const rawSpeed = position.coords.speed;
          setState((prev) => ({
            ...prev,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            // heading is -1 when unavailable/stationary — keep the last known value
            heading: rawHeading != null && rawHeading >= 0 ? rawHeading : prev.heading,
            speedKph: rawSpeed != null && rawSpeed > 0 ? rawSpeed * 3.6 : 0,
            hasFix: true,
            permissionDenied: false,
            error: null,
          }));
        }
      );

      if (cancelled) {
        subscription.remove();
        return;
      }
      subscriptionRef.current = subscription;
    }

    start().catch(() => undefined);

    return () => {
      cancelled = true;
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
    };
  }, [enabled]);

  return { ...state, requestLocation };
}
