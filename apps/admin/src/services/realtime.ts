import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL } from './config';

type SocketHandler = (socket: Socket) => void;

export function createRealtimeClient(onReady?: SocketHandler) {
  const socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    // Read the token per connection attempt so reconnects after a token
    // refresh authenticate with the fresh token, not the one from page load.
    auth: (cb) => cb({ token: localStorage.getItem('benbax.admin.accessToken') }),
    reconnection: true,
    // Render cold starts can take ~1 minute; never give up on the live feed.
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 20000,
  });

  let authRetries = 0;
  socket.on('connect_error', (err) => {
    console.warn('[socket] connect_error:', err.message);
    // A rejected token is not retried by socket.io. REST polling on the page
    // refreshes the token within seconds, so try again with the fresh one.
    if (socket.active || authRetries >= 5) return;
    authRetries += 1;
    setTimeout(() => {
      if (!socket.connected) socket.connect();
    }, 5000 * authRetries);
  });

  socket.on('connect', () => {
    authRetries = 0;
  });

  socket.on('disconnect', (reason) => {
    console.warn('[socket] disconnected:', reason);
  });

  socket.on('connect', () => {
    onReady?.(socket);
  });

  return socket;
}
