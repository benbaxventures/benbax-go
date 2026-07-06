import { useCallback, useEffect, useRef, useState } from 'react';

type LocationErrorType =
  'permission_denied' | 'services_disabled' | 'timeout' | 'unavailable' | null;

type LocationState = {
  latitude: number | null;
  longitude: number | null;
  label: string | null;
  address: string | null;
  nearbyName: string | null;
  loading: boolean;
  error: string | null;
  errorType: LocationErrorType;
  permissionDenied: boolean;
};

const initialState: LocationState = {
  latitude: null,
  longitude: null,
  label: null,
  address: null,
  nearbyName: null,
  loading: false,
  error: null,
  errorType: null,
  permissionDenied: false,
};

/**
 * Request current location from the device.
 *
 * - Always returns the final LocationState so callers can inspect the result.
 * - Catches every failure internally so no caller needs its own try/catch.
 * - Classifies failures into `errorType` for granular UI handling.
 */
async function getCurrentLocation(): Promise<LocationState> {
  let Location: typeof import('expo-location') | null = null; // eslint-disable-line @typescript-eslint/consistent-type-imports
  try {
    Location = await import('expo-location');
  } catch {
    return {
      ...initialState,
      loading: false,
      error: 'Location module is not available on this device.',
      errorType: 'unavailable',
    };
  }

  // 1. Permission
  let permission: { granted: boolean };
  try {
    permission = await Location.requestForegroundPermissionsAsync();
  } catch {
    return {
      ...initialState,
      loading: false,
      error: 'Could not request location permission due to an unexpected error.',
      errorType: 'unavailable',
    };
  }

  if (!permission.granted) {
    return {
      ...initialState,
      loading: false,
      permissionDenied: true,
      error:
        'Location permission denied. Enable it in system Settings to use location-based features.',
      errorType: 'permission_denied',
    };
  }

  // 2. Position
  let position: { coords: { latitude: number; longitude: number } };
  try {
    position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    const isDisabled = /disabled|denied|provider|service/i.test(message);
    const isTimeout = /timeout|timed ?out/i.test(message);

    return {
      ...initialState,
      loading: false,
      permissionDenied: false,
      error: isDisabled
        ? 'Location services are turned off. Turn on device location and try again.'
        : isTimeout
          ? 'Location request timed out. Try again in a moment.'
          : message || 'Could not determine your current location.',
      errorType: isDisabled ? 'services_disabled' : isTimeout ? 'timeout' : 'unavailable',
    };
  }

  // 3. Reverse-geocode (best-effort – never throw here)
  let label: string | null = null;
  let address: string | null = null;
  let nearbyName: string | null = null;
  try {
    const [place] = await Location.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
    nearbyName = place?.name || place?.street || place?.district || null;
    const addressParts = [
      place?.name,
      place?.street,
      place?.district,
      place?.city,
      place?.region,
      place?.country,
    ].filter(Boolean);
    address = addressParts.join(', ') || null;
    label = nearbyName || place?.city || address || 'Current location';
  } catch {
    // Reverse-geocode is non-critical; fall back to a simple label.
    label = 'Current location';
  }

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    label,
    address,
    nearbyName,
    loading: false,
    error: null,
    errorType: null,
    permissionDenied: false,
  };
}

export function useCurrentLocation() {
  const [state, setState] = useState<LocationState>(initialState);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Manually trigger a fresh location fetch. */
  const requestLocation = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null, errorType: null }));
    const result = await getCurrentLocation();
    // Only update state if the component is still mounted.
    if (mountedRef.current) {
      setState(result);
    }
  }, []);

  /** Auto-request location once when the component mounts. */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setState((prev) => ({ ...prev, loading: true }));
      const result = await getCurrentLocation();
      if (!cancelled && mountedRef.current) {
        setState(result);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally run only on mount.
  }, []);

  return { ...state, requestLocation };
}
