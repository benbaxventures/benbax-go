import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { createRealtimeClient } from '../services/realtime';
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
  if (id == null || Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
  return {
    id: String(id),
    latitude,
    longitude,
    distanceKm: d.distanceKm != null ? Number(d.distanceKm) : Number.NaN,
    vehicleType: typeof d.vehicleType === 'string' ? d.vehicleType : null,
    ...(typeof d.name === 'string' ? { name: d.name } : {}),
  };
}

type WatchArgs = {
  latitude: number;
  longitude: number;
  radiusKm?: number;
};

/**
 * Streams online drivers to the customer in real-time via Socket.IO.
 *
 * While `enabled` it opens a realtime socket, tells the server where the
 * customer is, and keeps the returned `drivers` array in sync as drivers
 * come online, move, and go offline. `live` is true once the server's
 * snapshot has arrived on the current connection — from then on an empty
 * list genuinely means "no drivers online" and must not be second-guessed
 * by the REST fallback.
 */
export function useNearbyDriversRealtime(
  enabled: boolean,
  location: { latitude: number | null; longitude: number | null }
) {
  const [drivers, setDrivers] = useState<NearbyDriver[]>([]);
  const [live, setLive] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const watchRef = useRef<WatchArgs>({ latitude: 0, longitude: 0 });

  const hasLocation = location.latitude != null && location.longitude != null;

  // Keep the latest watch position in a ref so re-emitting on movement doesn't
  // tear down and rebuild the socket.
  if (hasLocation) {
    watchRef.current = {
      latitude: location.latitude!,
      longitude: location.longitude!,
    };
  }

  useEffect(() => {
    if (!enabled || !hasLocation) {
      setDrivers([]);
      setLive(false);
      return;
    }

    let cancelled = false;

    createRealtimeClient().then((socket) => {
      if (cancelled) {
        socket.disconnect();
        return;
      }
      socketRef.current = socket;

      // Snapshot: full list of online drivers.
      socket.on(DRIVER_EVENTS.snapshot, (payload: unknown) => {
        const list = Array.isArray(payload) ? payload : [];
        const normalized = list.map(normalizeDriver).filter((d): d is NearbyDriver => d !== null);
        setDrivers(normalized);
        setLive(true);
      });

      // While disconnected the list can go stale; let the REST poll take over.
      socket.on('disconnect', () => setLive(false));

      // A new driver appeared.
      socket.on(DRIVER_EVENTS.online, (payload: unknown) => {
        const driver = normalizeDriver(payload);
        if (!driver) return;
        setDrivers((prev) => {
          if (prev.some((d) => d.id === driver.id)) return prev;
          return [...prev, driver];
        });
      });

      // A driver moved.
      socket.on(DRIVER_EVENTS.moved, (payload: unknown) => {
        const driver = normalizeDriver(payload);
        if (!driver) return;
        setDrivers((prev) => {
          const idx = prev.findIndex((d) => d.id === driver.id);
          if (idx === -1) return [...prev, driver];
          const next = prev.slice();
          next[idx] = { ...next[idx], ...driver };
          return next;
        });
      });

      // A driver went offline.
      socket.on(DRIVER_EVENTS.offline, (payload: unknown) => {
        const id =
          typeof payload === 'string'
            ? payload
            : payload && typeof payload === 'object'
              ? String((payload as Record<string, unknown>).id ?? '')
              : '';
        if (!id) return;
        setDrivers((prev) => prev.filter((d) => d.id !== id));
      });

      // Register all listeners before watching.
      const emitWatch = () => {
        if (watchRef.current.latitude !== 0 || watchRef.current.longitude !== 0) {
          socket.emit('driver:watch', watchRef.current);
        }
      };
      socket.on('connect', emitWatch);
      if (socket.connected) emitWatch();
    });

    return () => {
      cancelled = true;
      socketRef.current?.emit('driver:unwatch');
      socketRef.current?.disconnect();
      socketRef.current = null;
      setLive(false);
    };
  }, [enabled, hasLocation]);

  // Re-emit the watch position as the customer moves.
  useEffect(() => {
    if (!enabled || !hasLocation || !socketRef.current?.connected) return;
    socketRef.current.emit('driver:watch', watchRef.current);
  }, [enabled, hasLocation, location.latitude, location.longitude]);

  return { drivers, live };
}
