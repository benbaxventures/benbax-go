import { io, type Socket } from 'socket.io-client';
import { refreshAccessToken } from './api';
import { getAccessToken } from './authStorage';
import { resolveSocketUrl } from './network';

type SocketHandler = (socket: Socket) => void;

/**
 * Opens a realtime socket that survives expired access tokens and server
 * restarts.
 *
 * - `auth` is a callback, so every (re)connect sends the *current* token
 *   instead of the one captured when the socket was created.
 * - Access tokens live 15 minutes. When the server rejects one, socket.io does
 *   NOT retry by itself — previously the live driver map just froze. We
 *   refresh the token and reconnect instead.
 * - Unlimited reconnection attempts: Render cold starts can take ~1 minute.
 */
export async function createRealtimeClient(onReady?: SocketHandler) {
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
