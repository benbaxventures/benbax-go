import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../services/api';
import { acquireSharedSocket, onEveryConnect, releaseSharedSocket } from '../services/realtime';
import type { NearbyClient } from '../store/driverStore';
import { useDriverStore } from '../store/driverStore';

/** Realtime socket events for passengers who are online anywhere in the country. */
const CLIENT_EVENTS = {
  /** Bulk snapshot of everyone currently online. */
  snapshot: 'clients:nearby',
  /** A single passenger just came online. */
  online: 'client:online',
  /** A passenger moved while waiting. */
  moved: 'client:moved',
  /** A passenger went offline or got matched to another driver. */
  offline: 'client:offline',
} as const;

/** How often the driver re-announces itself so the server knows it's alive. */
const HEARTBEAT_MS = 20_000;
/** REST safety net in case a socket event was missed. */
const SNAPSHOT_REFRESH_MS = 15_000;

type DriverPosition = {
  latitude: number;
  longitude: number;
  heading?: number;
};

function normalizeClient(raw: unknown): NearbyClient | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const id = c.id ?? c.clientId ?? c.userId;
  const latitude = Number(c.latitude ?? c.lat);
  const longitude = Number(c.longitude ?? c.lng);
  if (id == null || Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
  const serviceClass =
    c.serviceClass === 'economy' || c.serviceClass === 'comfort' || c.serviceClass === 'premium'
      ? c.serviceClass
      : undefined;
  return {
    id: String(id),
    latitude,
    longitude,
    ...(serviceClass ? { serviceClass } : {}),
    ...(typeof c.name === 'string' ? { name: c.name } : {}),
    ...(c.distanceKm != null ? { distanceKm: Number(c.distanceKm) } : {}),
    since: typeof c.since === 'string' ? c.since : new Date().toISOString(),
  };
}

function parseOfflineId(payload: unknown) {
  if (typeof payload === 'string') return payload;
  if (payload && typeof payload === 'object') {
    return String((payload as Record<string, unknown>).id ?? '');
  }
  return '';
}

/**
 * While the driver is online:
 * - keeps `driverStore.nearbyClients` in sync with every passenger online
 *   nationwide (no distance cut-off), streamed over the socket with a REST
 *   snapshot as a safety net;
 * - heart-beats the driver's live position (`driver:report`) so customers see
 *   this driver on their map and dispatch can offer them rides.
 *
 * Returns `latestArrival` — the most recent passenger to appear — for a toast.
 */
export function useNearbyClients(enabled: boolean, driver: DriverPosition) {
  const nearbyClients = useDriverStore((s) => s.nearbyClients);
  const setNearbyClients = useDriverStore((s) => s.setNearbyClients);
  const upsertNearbyClient = useDriverStore((s) => s.upsertNearbyClient);
  const removeNearbyClient = useDriverStore((s) => s.removeNearbyClient);
  const clearNearbyClients = useDriverStore((s) => s.clearNearbyClients);

  const [latestArrival, setLatestArrival] = useState<NearbyClient | null>(null);
  const socketRef = useRef<ReturnType<typeof acquireSharedSocket> | null>(null);
  const knownIds = useRef<Set<string>>(new Set());
  const lastEmitRef = useRef({ latitude: 0, longitude: 0 });

  // Latest position in a ref so heartbeats and reconnects always send the
  // current fix without rebuilding the subscription.
  const positionRef = useRef<DriverPosition>(driver);
  positionRef.current = driver;

  useEffect(() => {
    if (!enabled) {
      clearNearbyClients();
      knownIds.current.clear();
      setLatestArrival(null);
      return;
    }

    let cancelled = false;
    const socket = acquireSharedSocket();
    socketRef.current = socket;

    const announce = () => {
      const { latitude, longitude, heading } = positionRef.current;
      if (!latitude && !longitude) return;
      lastEmitRef.current = { latitude, longitude };
      socket.emit('driver:report', { latitude, longitude, heading });
      socket.emit('client:watch', { latitude, longitude });
    };

    const refreshSnapshot = () => {
      apiRequest<unknown[]>('/drivers/me/nearby-clients')
        .then((clients) => {
          if (cancelled || !Array.isArray(clients)) return;
          const normalized = clients
            .map(normalizeClient)
            .filter((c): c is NearbyClient => c !== null);
          normalized.forEach((c) => knownIds.current.add(c.id));
          setNearbyClients(normalized);
        })
        .catch(() => undefined);
    };

    const handleSnapshot = (payload: unknown) => {
      const list = Array.isArray(payload) ? payload : [];
      const normalized = list.map(normalizeClient).filter((c): c is NearbyClient => c !== null);
      knownIds.current = new Set(normalized.map((c) => c.id));
      setNearbyClients(normalized);
    };

    const handleOnline = (payload: unknown) => {
      const client = normalizeClient(payload);
      if (!client) return;
      upsertNearbyClient(client);
      // Only toast for genuinely new arrivals, not reconnect replays.
      if (!knownIds.current.has(client.id)) {
        knownIds.current.add(client.id);
        setLatestArrival(client);
      }
    };

    const handleMoved = (payload: unknown) => {
      const client = normalizeClient(payload);
      if (client) upsertNearbyClient(client);
    };

    const handleOffline = (payload: unknown) => {
      const id = parseOfflineId(payload);
      if (!id) return;
      knownIds.current.delete(id);
      removeNearbyClient(id);
    };

    // Register listeners before watching: the server answers `client:watch`
    // with a snapshot immediately, so emitting first could lose it.
    socket.on(CLIENT_EVENTS.snapshot, handleSnapshot);
    socket.on(CLIENT_EVENTS.online, handleOnline);
    socket.on(CLIENT_EVENTS.moved, handleMoved);
    socket.on(CLIENT_EVENTS.offline, handleOffline);
    const stopAnnouncing = onEveryConnect(socket, announce);

    refreshSnapshot();
    const snapshotTimer = setInterval(refreshSnapshot, SNAPSHOT_REFRESH_MS);
    const heartbeatTimer = setInterval(() => {
      if (socket.connected) announce();
    }, HEARTBEAT_MS);

    return () => {
      cancelled = true;
      clearInterval(snapshotTimer);
      clearInterval(heartbeatTimer);
      stopAnnouncing();
      socket.emit('client:unwatch');
      socket.off(CLIENT_EVENTS.snapshot, handleSnapshot);
      socket.off(CLIENT_EVENTS.online, handleOnline);
      socket.off(CLIENT_EVENTS.moved, handleMoved);
      socket.off(CLIENT_EVENTS.offline, handleOffline);
      socketRef.current = null;
      releaseSharedSocket();
    };
  }, [enabled, clearNearbyClients, removeNearbyClient, setNearbyClients, upsertNearbyClient]);

  // Report meaningful movement (~15 m) right away rather than waiting for the
  // next heartbeat, so the customer map tracks the car smoothly.
  useEffect(() => {
    const socket = socketRef.current;
    if (!enabled || !socket?.connected || (!driver.latitude && !driver.longitude)) return;
    const last = lastEmitRef.current;
    const moved =
      Math.abs(driver.latitude - last.latitude) >= 0.00015 ||
      Math.abs(driver.longitude - last.longitude) >= 0.00015;
    if (!moved) return;
    lastEmitRef.current = { latitude: driver.latitude, longitude: driver.longitude };
    socket.emit('driver:report', {
      latitude: driver.latitude,
      longitude: driver.longitude,
      heading: driver.heading,
    });
    socket.emit('client:watch', { latitude: driver.latitude, longitude: driver.longitude });
  }, [enabled, driver.latitude, driver.longitude, driver.heading]);

  const acknowledgeArrival = () => setLatestArrival(null);

  return { nearbyClients, latestArrival, acknowledgeArrival };
}
