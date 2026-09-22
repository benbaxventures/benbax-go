import { realtimeEvents } from '@benbax/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { apiRequest, ApiResponseError } from '../services/api';
import { haversineMeters } from '../services/directions';
import { acquireSharedSocket, releaseSharedSocket } from '../services/realtime';
import type { OpenRideRequest } from '../store/driverStore';

/**
 * REST safety net only. The socket feed ('ride:open' / 'ride:closed') is the
 * live channel and a reconnect resyncs immediately, so this poll exists purely
 * to heal a missed event. At the old 15s it was four requests a minute
 * re-fetching data the app already had.
 */
const REFRESH_MS = 60_000;

function isOpenRideRequest(value: unknown): value is OpenRideRequest {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return typeof r.tripId === 'string' && !!r.pickup && !!r.dropoff;
}

/**
 * Every ride request waiting for a driver, nationwide. Kept live over the
 * socket (`ride:open` / `ride:closed`) with a periodic REST refresh as a
 * safety net. Distances are recomputed on-device from the driver's current
 * position so they stay right as the driver moves.
 */
export function useOpenRideRequests(
  enabled: boolean,
  driver: { latitude: number; longitude: number }
) {
  const [requests, setRequests] = useState<OpenRideRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const list = await apiRequest<unknown[]>('/ride-dispatch/open-requests', {
        background: true,
      });
      if (cancelledRef.current || !Array.isArray(list)) return;
      setRequests(list.filter(isOpenRideRequest));
    } catch (err) {
      // Older API without the marketplace: keep whatever we have.
      if (err instanceof ApiResponseError && err.status === 404) return;
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setRequests([]);
      return;
    }
    cancelledRef.current = false;
    setLoading(true);

    const socket = acquireSharedSocket();

    const handleOpen = (payload: unknown) => {
      if (!isOpenRideRequest(payload)) return;
      setRequests((prev) => [payload, ...prev.filter((r) => r.tripId !== payload.tripId)]);
    };
    const handleClosed = (payload: unknown) => {
      const tripId =
        payload && typeof payload === 'object'
          ? String((payload as Record<string, unknown>).tripId ?? '')
          : '';
      if (!tripId) return;
      setRequests((prev) => prev.filter((r) => r.tripId !== tripId));
    };
    // After a reconnect we may have missed events; resync.
    const handleConnect = () => void refresh();

    socket.on(realtimeEvents.rideOpen, handleOpen);
    socket.on(realtimeEvents.rideClosed, handleClosed);
    socket.on('connect', handleConnect);

    void refresh();
    // Skip the poll while the app is backgrounded: the socket keeps the list
    // current when it can, and a request that lands while nobody is looking
    // only spends the driver's rate-limit budget. Coming back to the
    // foreground resyncs once.
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, REFRESH_MS);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });

    return () => {
      cancelledRef.current = true;
      clearInterval(timer);
      appState.remove();
      socket.off(realtimeEvents.rideOpen, handleOpen);
      socket.off(realtimeEvents.rideClosed, handleClosed);
      socket.off('connect', handleConnect);
      releaseSharedSocket();
    };
  }, [enabled, refresh]);

  const hasPosition = Boolean(driver.latitude || driver.longitude);
  // Round so the list only re-sorts when the driver has moved ~100 m.
  const latKey = Math.round(driver.latitude * 1000);
  const lngKey = Math.round(driver.longitude * 1000);

  const sorted = useMemo(() => {
    if (!hasPosition) return requests;
    const from = { latitude: latKey / 1000, longitude: lngKey / 1000 };
    return requests
      .map((r) => ({
        ...r,
        distanceToPickupKm: Math.round(haversineMeters(from, r.pickup) / 100) / 10,
      }))
      .sort((a, b) => (a.distanceToPickupKm ?? 0) - (b.distanceToPickupKm ?? 0));
  }, [requests, hasPosition, latKey, lngKey]);

  /** Drop a request locally (e.g. after this driver accepted it). */
  const remove = useCallback((tripId: string) => {
    setRequests((prev) => prev.filter((r) => r.tripId !== tripId));
  }, []);

  return { requests: sorted, loading, refresh, remove };
}
