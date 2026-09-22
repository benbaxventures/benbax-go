import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Socket } from 'socket.io-client';
import { acquireSharedSocket, onEveryConnect, releaseSharedSocket } from '../services/realtime';

type PresenceArgs = {
  /** Only broadcast while the passenger is authenticated and has a location. */
  enabled: boolean;
  latitude: number | null;
  longitude: number | null;
  /** Optional friendly label shown to drivers (e.g. the passenger's name). */
  name?: string;
};

/** A driver who tapped "navigate to passenger" on this user. */
export type ApproachingDriver = {
  driverId: string;
  latitude: number | null;
  longitude: number | null;
  /** Seconds until arrival, as estimated by the driver app. */
  etaSeconds: number | null;
  updatedAt: number;
};

/** Re-report this often so the server knows the passenger is still here. */
const HEARTBEAT_MS = 25_000;
/** Forget an approaching driver who stopped sending positions. */
const APPROACH_STALE_MS = 2 * 60 * 1000;

/**
 * Keeps a lightweight realtime connection open while the passenger is on the
 * app with a known location, reporting their position so online drivers
 * nationwide see them on the dispatch map. Position is re-sent on movement and
 * as a heartbeat; backgrounding the app takes the passenger off the map.
 *
 * Also surfaces a driver who is heading to this passenger in real time.
 */
export function useClientPresence({ enabled, latitude, longitude, name }: PresenceArgs) {
  const socketRef = useRef<Socket | null>(null);
  const [approachingDriver, setApproachingDriver] = useState<ApproachingDriver | null>(null);

  // Keep the latest position in a ref so movement re-emits without rebuilding
  // the socket connection.
  const positionRef = useRef<{ latitude: number; longitude: number; name?: string }>({
    latitude: 0,
    longitude: 0,
  });
  if (latitude != null && longitude != null) {
    positionRef.current = { latitude, longitude, ...(name ? { name } : {}) };
  }

  const hasLocation = latitude != null && longitude != null;

  // Subscribe / unsubscribe with the enabled+location lifecycle. This rides the
  // app's shared socket rather than opening a second connection alongside the
  // nearby-driver stream.
  useEffect(() => {
    if (!enabled || !hasLocation) return;

    let inForeground = AppState.currentState === 'active';

    const report = (socket: Socket) => {
      if (inForeground && socket.connected) socket.emit('client:report', positionRef.current);
    };

    const appState = AppState.addEventListener('change', (state) => {
      const socket = socketRef.current;
      inForeground = state === 'active';
      if (!socket) return;
      if (inForeground) report(socket);
      else socket.emit('client:leave');
    });

    const socket = acquireSharedSocket();
    socketRef.current = socket;

    const handleNavigationStarted = (payload: { driverId?: string }) => {
      if (!payload?.driverId) return;
      setApproachingDriver({
        driverId: payload.driverId,
        latitude: null,
        longitude: null,
        etaSeconds: null,
        updatedAt: Date.now(),
      });
    };

    const handleDriverLocation = (payload: {
      driverId?: string;
      latitude?: number;
      longitude?: number;
      eta?: number;
    }) => {
      if (!payload?.driverId) return;
      const lat = Number(payload.latitude);
      const lng = Number(payload.longitude);
      setApproachingDriver({
        driverId: payload.driverId,
        latitude: Number.isFinite(lat) ? lat : null,
        longitude: Number.isFinite(lng) ? lng : null,
        etaSeconds: Number.isFinite(Number(payload.eta)) ? Number(payload.eta) : null,
        updatedAt: Date.now(),
      });
    };

    socket.on('navigation:started', handleNavigationStarted);
    socket.on('driver:location', handleDriverLocation);
    // Re-report on every reconnect: the server forgets presence when the
    // connection drops, so a silent reconnect would leave this passenger
    // invisible to drivers until the next heartbeat.
    const stopReporting = onEveryConnect(socket, () => report(socket));
    const heartbeat = setInterval(() => report(socket), HEARTBEAT_MS);

    return () => {
      appState.remove();
      clearInterval(heartbeat);
      stopReporting();
      socket.emit('client:leave');
      socket.off('navigation:started', handleNavigationStarted);
      socket.off('driver:location', handleDriverLocation);
      socketRef.current = null;
      releaseSharedSocket();
    };
  }, [enabled, hasLocation]);

  // Re-emit position as the passenger moves.
  useEffect(() => {
    if (!enabled || !hasLocation || !socketRef.current?.connected) return;
    socketRef.current.emit('client:report', positionRef.current);
  }, [enabled, hasLocation, latitude, longitude]);

  // Drop the "driver on the way" banner once updates stop.
  useEffect(() => {
    if (!approachingDriver) return;
    const timer = setTimeout(
      () => setApproachingDriver(null),
      APPROACH_STALE_MS - (Date.now() - approachingDriver.updatedAt)
    );
    return () => clearTimeout(timer);
  }, [approachingDriver]);

  return { approachingDriver, dismissApproachingDriver: () => setApproachingDriver(null) };
}
