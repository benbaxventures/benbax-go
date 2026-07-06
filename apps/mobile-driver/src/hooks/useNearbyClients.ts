import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { apiRequest } from '../services/api';
import { createRealtimeClient } from '../services/realtime';
import type { NearbyClient } from '../store/driverStore';
import { useDriverStore } from '../store/driverStore';

/**
 * Realtime socket events for passengers coming online near the driver. These are
 * additive to the shared `realtimeEvents` map and can be promoted there once the
 * backend emits them under the same names.
 */
const CLIENT_EVENTS = {
  /** Bulk snapshot of everyone currently online in range. */
  snapshot: 'clients:nearby',
  /** A single passenger just came online. */
  online: 'client:online',
  /** A passenger moved while waiting. */
  moved: 'client:moved',
  /** A passenger went offline or got matched to another driver. */
  offline: 'client:offline',
} as const;

type WatchArgs = {
  latitude: number;
  longitude: number;
  radiusKm: number;
};

function normalizeClient(raw: unknown): NearbyClient | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const id = c.id ?? c.clientId ?? c.userId;
  const latitude = Number(c.latitude ?? c.lat);
  const longitude = Number(c.longitude ?? c.lng);
  if (id == null || Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
  return {
    id: String(id),
    latitude,
    longitude,
    serviceClass: c.serviceClass as NearbyClient['serviceClass'],
    name: typeof c.name === 'string' ? c.name : undefined,
    distanceKm: c.distanceKm != null ? Number(c.distanceKm) : undefined,
    since: typeof c.since === 'string' ? c.since : new Date().toISOString(),
  };
}

/**
 * Streams the passengers who are currently online near the driver.
 *
 * While `enabled` (driver online) it opens a realtime socket, tells the server
 * where the driver is watching, and keeps `driverStore.nearbyClients` in sync as
 * clients come online, move, and go offline. It also returns `latestArrival` —
 * the most recent client to appear — so the screen can surface a toast.
 */
export function useNearbyClients(
  enabled: boolean,
  driver: { latitude: number; longitude: number; radiusKm?: number }
) {
  const nearbyClients = useDriverStore((s) => s.nearbyClients);
  const setNearbyClients = useDriverStore((s) => s.setNearbyClients);
  const upsertNearbyClient = useDriverStore((s) => s.upsertNearbyClient);
  const removeNearbyClient = useDriverStore((s) => s.removeNearbyClient);
  const clearNearbyClients = useDriverStore((s) => s.clearNearbyClients);

  const [latestArrival, setLatestArrival] = useState<NearbyClient | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const knownIds = useRef<Set<string>>(new Set());

  // Keep the latest watch position in a ref so re-emitting on movement doesn't
  // tear down and rebuild the socket.
  const watchRef = useRef<WatchArgs>({ latitude: 0, longitude: 0, radiusKm: 10 });
  watchRef.current = {
    latitude: driver.latitude,
    longitude: driver.longitude,
    radiusKm: driver.radiusKm ?? 10,
  };

  useEffect(() => {
    if (!enabled) {
      clearNearbyClients();
      knownIds.current.clear();
      setLatestArrival(null);
      return;
    }

    let cancelled = false;

    // Best-effort initial snapshot so the map isn't empty before the first event.
    apiRequest<NearbyClient[]>('/drivers/me/nearby-clients')
      .then((clients) => {
        if (cancelled || !Array.isArray(clients)) return;
        const normalized = clients
          .map(normalizeClient)
          .filter((c): c is NearbyClient => c !== null);
        normalized.forEach((c) => knownIds.current.add(c.id));
        setNearbyClients(normalized);
      })
      .catch(() => undefined);

    createRealtimeClient((socket) => {
      // Tell the server where this driver is watching for online passengers.
      socket.emit('client:watch', watchRef.current);
    }).then((socket) => {
      if (cancelled) {
        socket.disconnect();
        return;
      }
      socketRef.current = socket;

      socket.on(CLIENT_EVENTS.snapshot, (payload: unknown) => {
        const list = Array.isArray(payload) ? payload : [];
        const normalized = list.map(normalizeClient).filter((c): c is NearbyClient => c !== null);
        knownIds.current = new Set(normalized.map((c) => c.id));
        setNearbyClients(normalized);
      });

      socket.on(CLIENT_EVENTS.online, (payload: unknown) => {
        const client = normalizeClient(payload);
        if (!client) return;
        upsertNearbyClient(client);
        // Only toast for genuinely new arrivals, not reconnect replays.
        if (!knownIds.current.has(client.id)) {
          knownIds.current.add(client.id);
          setLatestArrival(client);
        }
      });

      socket.on(CLIENT_EVENTS.moved, (payload: unknown) => {
        const client = normalizeClient(payload);
        if (client) upsertNearbyClient(client);
      });

      socket.on(CLIENT_EVENTS.offline, (payload: unknown) => {
        const id =
          typeof payload === 'string'
            ? payload
            : payload && typeof payload === 'object'
              ? String((payload as Record<string, unknown>).id ?? '')
              : '';
        if (!id) return;
        knownIds.current.delete(id);
        removeNearbyClient(id);
      });
    });

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [enabled, clearNearbyClients, removeNearbyClient, setNearbyClients, upsertNearbyClient]);

  // Re-emit the watch position as the driver moves so server-side scoping stays
  // accurate, without recreating the socket.
  useEffect(() => {
    if (!enabled || !socketRef.current) return;
    socketRef.current.emit('client:watch', watchRef.current);
  }, [enabled, driver.latitude, driver.longitude, driver.radiusKm]);

  const acknowledgeArrival = () => setLatestArrival(null);

  return { nearbyClients, latestArrival, acknowledgeArrival };
}
