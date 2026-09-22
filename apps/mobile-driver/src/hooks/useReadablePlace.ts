import { useCallback, useEffect, useRef, useState } from 'react';
import {
  describePlace,
  formatPlaceLabel,
  metersBetween,
  RESOLVING_PLACE_LABEL,
  type ResolvedPlace,
} from '../services/placeName';

type Options = {
  /** Pause resolving entirely (screen unfocused, no permission, …). */
  enabled?: boolean;
  /**
   * Re-name the point only after it has moved this far. Small GPS jitter must
   * not swap "Church of Pentecost, Golf Estate" for a neighbouring result.
   */
  minMoveMeters?: number;
  /** Wait for the position to settle before spending an API call. */
  debounceMs?: number;
  /** Allow the (pricier) Places landmark lookup when geocoding finds nothing. */
  allowLandmarkSearch?: boolean;
};

const DEFAULT_MIN_MOVE_METERS = 120;
const DEFAULT_DEBOUNCE_MS = 1200;
/** The very first fix should appear quickly; later ones can settle. */
const FIRST_FIX_DEBOUNCE_MS = 300;

/**
 * Names a coordinate for display, and keeps that name current as the point
 * moves — without flickering and without an API call per GPS tick.
 *
 * Coordinates remain the source of truth for the caller; this only produces the
 * text a person reads. While the first lookup is in flight `label` is
 * "Finding your location…", never a Plus Code.
 */
export function useReadablePlace(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  options: Options = {}
) {
  const {
    enabled = true,
    minMoveMeters = DEFAULT_MIN_MOVE_METERS,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    allowLandmarkSearch = true,
  } = options;

  const [place, setPlace] = useState<ResolvedPlace | null>(null);
  const [resolving, setResolving] = useState(false);

  // The point the current `place` was resolved for — the yardstick for
  // "has the user moved far enough to be somewhere else?".
  const resolvedForRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const hasPoint = typeof latitude === 'number' && typeof longitude === 'number';

  useEffect(() => {
    if (!enabled || !hasPoint) return;

    const point = { latitude: latitude as number, longitude: longitude as number };
    const resolvedFor = resolvedForRef.current;
    // Still in the same place — keep the name we already show, spend nothing.
    if (resolvedFor && metersBetween(resolvedFor, point) < minMoveMeters) return;

    // Only guards *this* hook's state updates. The lookup itself is shared with
    // every other consumer of the same map cell, so it is never cancelled here.
    let superseded = false;
    const delay = resolvedFor ? debounceMs : FIRST_FIX_DEBOUNCE_MS;

    setResolving(true);
    const timer = setTimeout(() => {
      // `describePlace` is cached per ~55 m cell, so a re-mount or a short hop
      // back to a known spot resolves without touching the network.
      void describePlace(point.latitude, point.longitude, { allowLandmarkSearch }).then((next) => {
        if (superseded || !mountedRef.current) return;
        setResolving(false);
        // A failed lookup keeps the previous good name rather than downgrading
        // the user to a Plus Code mid-trip.
        if (next.isFallback && resolvedForRef.current) return;
        resolvedForRef.current = point;
        setPlace(next);
      });
    }, delay);

    return () => {
      superseded = true;
      clearTimeout(timer);
      if (mountedRef.current) setResolving(false);
    };
  }, [enabled, hasPoint, latitude, longitude, minMoveMeters, debounceMs, allowLandmarkSearch]);

  // Drop the stale name when the point disappears (permission revoked, logout).
  useEffect(() => {
    if (hasPoint) return;
    resolvedForRef.current = null;
    setPlace(null);
  }, [hasPoint]);

  /** Force a fresh lookup for the current point (e.g. a "relocate me" tap). */
  const refresh = useCallback(() => {
    resolvedForRef.current = null;
    if (!hasPoint) return;
    setResolving(true);
    void describePlace(latitude as number, longitude as number, { allowLandmarkSearch }).then(
      (next) => {
        if (!mountedRef.current) return;
        setResolving(false);
        resolvedForRef.current = { latitude: latitude as number, longitude: longitude as number };
        setPlace(next);
      }
    );
  }, [allowLandmarkSearch, hasPoint, latitude, longitude]);

  const label = place ? formatPlaceLabel(place) : hasPoint ? RESOLVING_PLACE_LABEL : null;

  return {
    /** The full normalized location object (coordinates + names). */
    place,
    /** Ready-to-render string: "Church of Pentecost, Golf Estate". */
    label,
    /** Short name only, without the area suffix. */
    placeName: place?.placeName ?? null,
    /** True while a lookup is in flight (the previous name stays visible). */
    resolving,
    refresh,
  };
}
