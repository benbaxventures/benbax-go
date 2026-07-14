import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { createRealtimeClient } from '../services/realtime';

type PresenceArgs = {
  /** Only broadcast while the passenger is authenticated and has a location. */
  enabled: boolean;
  latitude: number | null;
  longitude: number | null;
  /** Optional friendly label shown to drivers (e.g. the passenger's name). */
  name?: string;
};

/**
 * Keeps a lightweight realtime connection open while the passenger is on the
 * app with a known location, reporting their position to the server so nearby
 * online drivers see them appear on the dispatch map. The socket is opened once
 * and the position is re-emitted as it changes, without tearing the socket down.
 */
export function useClientPresence({ enabled, latitude, longitude, name }: PresenceArgs) {
  const socketRef = useRef<Socket | null>(null);

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

  // Open / close the socket with the enabled+location lifecycle.
  useEffect(() => {
    if (!enabled || !hasLocation) return;

    let cancelled = false;

    createRealtimeClient((socket) => {
      socket.emit('client:report', positionRef.current);
    }).then((socket) => {
      if (cancelled) {
        socket.disconnect();
        return;
      }
      socketRef.current = socket;
    });

    return () => {
      cancelled = true;
      socketRef.current?.emit('client:unwatch');
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [enabled, hasLocation]);

  // Re-emit position as the passenger moves.
  useEffect(() => {
    if (!enabled || !hasLocation || !socketRef.current?.connected) return;
    socketRef.current.emit('client:report', positionRef.current);
  }, [enabled, hasLocation, latitude, longitude]);
}
