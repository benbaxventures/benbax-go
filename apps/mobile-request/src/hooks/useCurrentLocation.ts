import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { RESOLVING_PLACE_LABEL, type ResolvedPlace } from '../services/placeName';
import { useReadablePlace } from './useReadablePlace';

type LocationErrorType =
  'permission_denied' | 'services_disabled' | 'timeout' | 'unavailable' | null;

type FixState = {
  latitude: number | null;
  longitude: number | null;
  /** Reported horizontal accuracy in metres, when the device provides it. */
  accuracyMeters: number | null;
  loading: boolean;
  error: string | null;
  errorType: LocationErrorType;
  permissionDenied: boolean;
};

const initialState: FixState = {
  latitude: null,
  longitude: null,
  accuracyMeters: null,
  loading: false,
  error: null,
  errorType: null,
  permissionDenied: false,
};

/** Ignore watch updates smaller than this so the UI doesn't churn on GPS jitter. */
const MIN_COORD_MOVE_METERS = 10;
/** Position updates while the passenger is on the booking screen. */
const WATCH_DISTANCE_INTERVAL_M = 25;
const WATCH_TIME_INTERVAL_MS = 10_000;

function metersApart(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Asks the device where it is.
 *
 * - Always resolves with a FixState so no caller needs its own try/catch.
 * - Classifies failures into `errorType` so the UI can say something useful
 *   ("turn on location services" vs "permission denied").
 * - Does no reverse geocoding: naming the point is `useReadablePlace`'s job.
 */
async function getCurrentFix(): Promise<FixState> {
  let Location: typeof import('expo-location') | null = null; // eslint-disable-line @typescript-eslint/consistent-type-imports
  try {
    Location = await import('expo-location');
  } catch {
    return {
      ...initialState,
      error: 'Location module is not available on this device.',
      errorType: 'unavailable',
    };
  }

  let permission: { granted: boolean };
  try {
    permission = await Location.requestForegroundPermissionsAsync();
  } catch {
    return {
      ...initialState,
      error: 'Could not request location permission due to an unexpected error.',
      errorType: 'unavailable',
    };
  }

  if (!permission.granted) {
    return {
      ...initialState,
      permissionDenied: true,
      error:
        'Location permission denied. Enable it in system Settings to use location-based features.',
      errorType: 'permission_denied',
    };
  }

  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyMeters:
        typeof position.coords.accuracy === 'number' ? position.coords.accuracy : null,
      loading: false,
      error: null,
      errorType: null,
      permissionDenied: false,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    const isDisabled = /disabled|denied|provider|service/i.test(message);
    const isTimeout = /timeout|timed ?out/i.test(message);

    return {
      ...initialState,
      error: isDisabled
        ? 'Location services are turned off. Turn on device location and try again.'
        : isTimeout
          ? 'Location request timed out. Try again in a moment.'
          : message || 'Could not determine your current location.',
      errorType: isDisabled ? 'services_disabled' : isTimeout ? 'timeout' : 'unavailable',
    };
  }
}

/**
 * The passenger's live position, plus the human-readable name of where they
 * are. Coordinates update as they move (throttled to real movement); the name
 * is resolved through the shared place service, which debounces, caches, and
 * never shows a Plus Code while a better answer is reachable.
 */
export function useCurrentLocation() {
  const [state, setState] = useState<FixState>(initialState);
  const mountedRef = useRef(true);
  const watchRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Accept a new fix only when it is a real move, so the whole booking screen
  // doesn't re-render on every metre of GPS noise.
  const applyFix = useCallback((next: FixState) => {
    if (!mountedRef.current) return;
    setState((prev) => {
      if (
        next.latitude != null &&
        next.longitude != null &&
        prev.latitude != null &&
        prev.longitude != null &&
        metersApart(
          { latitude: prev.latitude, longitude: prev.longitude },
          { latitude: next.latitude, longitude: next.longitude }
        ) < MIN_COORD_MOVE_METERS
      ) {
        // Same spot: keep the coordinates stable, just clear any stale error.
        return prev.error === next.error && prev.loading === next.loading
          ? prev
          : { ...prev, error: next.error, errorType: next.errorType, loading: next.loading };
      }
      return next;
    });
  }, []);

  /** Manually trigger a fresh location fetch. */
  const requestLocation = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null, errorType: null }));
    const result = await getCurrentFix();
    if (mountedRef.current) setState(result);
  }, []);

  // One fix on mount, then follow the passenger while the app is foregrounded.
  useEffect(() => {
    let cancelled = false;
    // `start` is async, so two resume events in quick succession could both pass
    // the "no watcher yet" check and leave a second, unreferenced subscription
    // running forever. This latch makes starting up idempotent.
    let starting = false;

    async function start() {
      if (starting || watchRef.current) return;
      starting = true;
      setState((prev) => ({ ...prev, loading: true }));
      const first = await getCurrentFix();
      if (cancelled || !mountedRef.current) {
        starting = false;
        return;
      }
      setState(first);
      if (first.latitude == null) {
        starting = false;
        return;
      }

      try {
        const Location = await import('expo-location');
        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: WATCH_DISTANCE_INTERVAL_M,
            timeInterval: WATCH_TIME_INTERVAL_MS,
          },
          (position) => {
            applyFix({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracyMeters:
                typeof position.coords.accuracy === 'number' ? position.coords.accuracy : null,
              loading: false,
              error: null,
              errorType: null,
              permissionDenied: false,
            });
          }
        );
        if (cancelled) {
          subscription.remove();
          return;
        }
        watchRef.current = subscription;
      } catch {
        // A one-off fix is still enough to book with; just don't follow along.
      } finally {
        starting = false;
      }
    }

    void start();

    // Stop draining the battery while the app is in the background, and pick a
    // fresh fix up on return (the passenger may have travelled meanwhile).
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        if (watchRef.current) void getCurrentFix().then(applyFix);
        else void start();
      } else {
        watchRef.current?.remove();
        watchRef.current = null;
      }
    });

    return () => {
      cancelled = true;
      appState.remove();
      watchRef.current?.remove();
      watchRef.current = null;
    };
  }, [applyFix]);

  const {
    place,
    label: placeLabel,
    resolving: resolvingPlace,
    refresh: refreshPlace,
  } = useReadablePlace(state.latitude, state.longitude);

  const hasFix = state.latitude != null && state.longitude != null;

  return {
    ...state,
    /** Normalized location object: coordinates plus every naming tier. */
    place,
    /** True while the name is being looked up (coordinates are already usable). */
    resolvingPlace,
    /**
     * Human-readable location. `null` until there is a fix, then
     * "Finding your location…" until the name resolves — never a Plus Code.
     */
    label: hasFix ? (placeLabel ?? RESOLVING_PLACE_LABEL) : null,
    /** Full address line for secondary text. */
    address: place?.formattedAddress ?? null,
    /** Nearest landmark/POI, when one was identified. */
    nearbyName: place?.landmark ?? place?.area ?? null,
    requestLocation,
    refreshPlace,
  };
}

export type { ResolvedPlace };
