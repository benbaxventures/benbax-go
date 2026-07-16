import { io, type Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:4000';

type SocketHandler = (socket: Socket) => void;

export function createRealtimeClient(onReady?: SocketHandler) {
  const socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    // Read the token per connection attempt so reconnects after a token
    // refresh authenticate with the fresh token, not the one from page load.
    auth: (cb) => cb({ token: localStorage.getItem('benbax.admin.accessToken') }),
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 10000,
  });

  socket.on('connect_error', (err) => {
    console.warn('[socket] connect_error:', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.warn('[socket] disconnected:', reason);
  });

  socket.on('connect', () => {
    onReady?.(socket);
  });

  return socket;
}
