import { useEffect, useRef, useState } from 'react';
import { acquireSharedSocket, onEveryConnect, releaseSharedSocket } from '../services/realtime';
import type { NearbyDriver } from './useNearbyDrivers';

/**
 * Realtime socket events for drivers appearing near the customer. These mirror
 * the passenger-side events used by the driver app.
 */
const DRIVER_EVENTS = {
  /** Bulk snapshot of all online drivers. */
  snapshot: 'drivers:nearby',
  /** A single driver just came online. */
  online: 'driver:online',
  /** A driver moved. */
  moved: 'driver:moved',
  /** A driver went offline. */
  offline: 'driver:offline',
} as const;

function normalizeDriver(raw: unknown): NearbyDriver | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const id = d.id ?? d.driverId;
  const latitude = Number(d.latitude ?? d.lat);
  const longitude = Number(d.longitude ?? d.lng);
  // A driver whose app reported a bad fix must not break the map: drop them
  // from the list rather than rendering a marker at (NaN, NaN).
  if (id == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  const heading = Number(d.heading);
  return {
    id: String(id),
    latitude,
    longitude,
    distanceKm: d.distanceKm != null ? Number(d.distanceKm) : Number.NaN,
    vehicleType: typeof d.vehicleType === 'string' ? d.vehicleType : null,
    ...(typeof d.name === 'string' ? { name: d.name } : {}),
    ...(typeof d.since === 'string' ? { since: d.since } : {}),
    ...(Number.isFinite(heading) && heading >= 0 ? { heading } : {}),
  };
}

type WatchArgs = {
  latitude: number;
  longitude: number;
};

/**
 * Streams online drivers to the customer in real-time via Socket.IO.
 *
 * While `enabled` it subscribes on the app's *shared* socket, tells the server
 * where the customer is, and keeps the returned `drivers` array in sync as
 * drivers come online, move, and go offline. `live` is true once the server's
 * snapshot has arrived on the current connection — from then on an empty list
 * genuinely means "no drivers online" and must not be second-guessed by the
 * REST fallback.
 *
 * The subscription is opened once for the screen and shared by every consumer
 * (the map markers and the driver list sheet both read this one array), so
 * opening and closing the list costs nothing.
 */
export function useNearbyDriversRealtime(
  enabled: boolean,
  location: { latitude: number | null; longitude: number | null }
) {
  const [drivers, setDrivers] = useState<NearbyDriver[]>([]);
  const [live, setLive] = useState(false);
  const socketRef = useRef<ReturnType<typeof acquireSharedSocket> | null>(null);
  const watchRef = useRef<WatchArgs | null>(null);

  const hasLocation = location.latitude != null && location.longitude != null;

  // Keep the latest watch position in a ref so re-emitting on movement doesn't
  // tear down and rebuild the subscription.
  if (hasLocation) {
    watchRef.current = {
      latitude: location.latitude as number,
      longitude: location.longitude as number,
    };
  }

  useEffect(() => {
    if (!enabled || !hasLocation) {
      setDrivers([]);
      setLive(false);
      return;
    }

    const socket = acquireSharedSocket();
    socketRef.current = socket;

    // Snapshot: full list of online drivers.
    const handleSnapshot = (payload: unknown) => {
      const list = Array.isArray(payload) ? payload : [];
      setDrivers(list.map(normalizeDriver).filter((d): d is NearbyDriver => d !== null));
      setLive(true);
    };

    // While disconnected the list can go stale; let the REST poll take over.
    const handleDisconnect = () => setLive(false);

    // A new driver appeared.
    const handleOnline = (payload: unknown) => {
      const driver = normalizeDriver(payload);
      if (!driver) return;
      setDrivers((prev) => (prev.some((d) => d.id === driver.id) ? prev : [...prev, driver]));
    };

    // A driver moved.
    const handleMoved = (payload: unknown) => {
      const driver = normalizeDriver(payload);
      if (!driver) return;
      setDrivers((prev) => {
        const idx = prev.findIndex((d) => d.id === driver.id);
        if (idx === -1) return [...prev, driver];
        const next = prev.slice();
        next[idx] = { ...next[idx], ...driver };
        return next;
      });
    };

    // A driver went offline.
    const handleOffline = (payload: unknown) => {
      const id =
        typeof payload === 'string'
          ? payload
          : payload && typeof payload === 'object'
            ? String((payload as Record<string, unknown>).id ?? '')
            : '';
      if (!id) return;
      setDrivers((prev) => prev.filter((d) => d.id !== id));
    };

    // Register every listener before watching: the server answers
    // `driver:watch` with a snapshot immediately, so emitting first loses it.
    socket.on(DRIVER_EVENTS.snapshot, handleSnapshot);
    socket.on(DRIVER_EVENTS.online, handleOnline);
    socket.on(DRIVER_EVENTS.moved, handleMoved);
    socket.on(DRIVER_EVENTS.offline, handleOffline);
    socket.on('disconnect', handleDisconnect);

    // Re-subscribe after every reconnect, not just the first connect.
    const stopWatching = onEveryConnect(socket, () => {
      if (watchRef.current) socket.emit('driver:watch', watchRef.current);
    });

    return () => {
      stopWatching();
      socket.emit('driver:unwatch');
      socket.off(DRIVER_EVENTS.snapshot, handleSnapshot);
      socket.off(DRIVER_EVENTS.online, handleOnline);
      socket.off(DRIVER_EVENTS.moved, handleMoved);
      socket.off(DRIVER_EVENTS.offline, handleOffline);
      socket.off('disconnect', handleDisconnect);
      socketRef.current = null;
      releaseSharedSocket();
      setLive(false);
    };
  }, [enabled, hasLocation]);

  // Re-emit the watch position as the customer moves.
  useEffect(() => {
    if (!enabled || !hasLocation || !socketRef.current?.connected || !watchRef.current) return;
    socketRef.current.emit('driver:watch', watchRef.current);
  }, [enabled, hasLocation, location.latitude, location.longitude]);

  return { drivers, live };
}
