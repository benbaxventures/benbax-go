import { io, type Socket } from 'socket.io-client';
import { refreshAccessToken } from './api';
import { getAccessToken } from './authStorage';
import { resolveSocketUrl } from './network';

type SocketHandler = (socket: Socket) => void;

/**
 * Builds a realtime socket that survives expired access tokens and server
 * restarts.
 *
 * - `auth` is a callback, so every (re)connect sends the *current* token
 *   instead of the one captured when the socket was created.
 * - Access tokens live 15 minutes. When the server rejects one, socket.io does
 *   NOT retry by itself — previously the live driver map just froze. We
 *   refresh the token and reconnect instead.
 * - Unlimited reconnection attempts: Render cold starts can take ~1 minute.
 */
function buildSocket(onReady?: SocketHandler): Socket {
  const socket = io(resolveSocketUrl(), {
    transports: ['websocket', 'polling'],
    auth: (cb) => {
      getAccessToken()
        .then((token) => cb({ token }))
        .catch(() => cb({ token: null }));
    },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 20000,
  });

  let authRetries = 0;
  socket.on('connect_error', (err) => {
    console.warn('[socket] connect_error:', err.message);
    if (socket.active) return; // transient: socket.io will retry by itself
    if (authRetries >= 5) return;
    authRetries += 1;
    refreshAccessToken()
      .catch(() => false)
      .then((refreshed) => {
        const delay = refreshed ? 500 : 5000 * authRetries;
        setTimeout(() => {
          if (!socket.connected) socket.connect();
        }, delay);
      });
  });

  socket.on('disconnect', (reason) => {
    console.warn('[socket] disconnected:', reason);
    // A server-side disconnect is also not retried automatically.
    if (reason === 'io server disconnect') socket.connect();
  });

  socket.on('connect', () => {
    authRetries = 0;
    onReady?.(socket);
  });

  return socket;
}

/** A dedicated socket owned by the caller, who must disconnect it. */
export async function createRealtimeClient(onReady?: SocketHandler) {
  return buildSocket(onReady);
}

let shared: { socket: Socket; refs: number } | null = null;

/**
 * One socket shared by every always-on live feature of the customer app
 * (passenger presence, the nearby-driver stream, the driver list sheet).
 *
 * Opening a second connection per feature cost a whole extra handshake,
 * heartbeat and auth cycle for the same data. Callers must remove the listeners
 * they added with `socket.off(event, handler)` and call `releaseSharedSocket()`
 * on unmount; the connection closes once the last holder lets go.
 *
 * Mirrors the driver app's `services/realtime.ts`.
 */
export function acquireSharedSocket(): Socket {
  if (!shared) shared = { socket: buildSocket(), refs: 0 };
  shared.refs += 1;
  return shared.socket;
}

export function releaseSharedSocket() {
  if (!shared) return;
  shared.refs -= 1;
  if (shared.refs <= 0) {
    shared.socket.disconnect();
    shared = null;
  }
}

/**
 * Runs `handler` now if connected and again after every reconnect, returning a
 * cleanup. Use it for emits the server must hear on each new connection (watch
 * subscriptions, presence reports, room joins) — otherwise a reconnect leaves
 * the app silently unsubscribed.
 */
export function onEveryConnect(socket: Socket, handler: () => void) {
  socket.on('connect', handler);
  if (socket.connected) handler();
  return () => {
    socket.off('connect', handler);
  };
}
