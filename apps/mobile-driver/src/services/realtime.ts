import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, type Socket } from 'socket.io-client';
import { refreshAccessToken } from './api';
import { resolveSocketUrl } from './network';

const SOCKET_URL = resolveSocketUrl();
const ACCESS_TOKEN_KEY = 'benbax.driver.accessToken';

type SocketHandler = (socket: Socket) => void;

/**
 * Builds a socket that survives expired access tokens and server restarts.
 *
 * - `auth` is a callback, so every (re)connect sends the *current* token
 *   instead of the one captured when the socket was created.
 * - Access tokens live 15 minutes. When the server rejects one, socket.io does
 *   NOT retry on its own, which used to leave drivers silently deaf to offers.
 *   We refresh the token and reconnect instead.
 * - Unlimited reconnection attempts: Render cold starts can take ~1 minute.
 */
function buildSocket(onReady?: SocketHandler): Socket {
  const socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    auth: (cb) => {
      AsyncStorage.getItem(ACCESS_TOKEN_KEY)
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
 * One socket shared by every live feature of the driver app (presence,
 * passengers, open requests, offers). Callers must remove the listeners they
 * add with `socket.off(event, handler)` and call `releaseSharedSocket()`.
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
 * Runs `handler` now if connected and again after every reconnect, returning
 * a cleanup. Use it for emits the server must hear on each new connection
 * (watch subscriptions, presence reports, room joins).
 */
export function onEveryConnect(socket: Socket, handler: () => void) {
  socket.on('connect', handler);
  if (socket.connected) handler();
  return () => {
    socket.off('connect', handler);
  };
}

export function emitDriverLocation(
  socket: Socket | null,
  payload: {
    driverId: string;
    clientId: string;
    latitude: number;
    longitude: number;
    bearing: number;
    eta: number;
  }
) {
  socket?.emit('driver:location', payload);
}
