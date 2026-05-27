import { io, type Socket } from 'socket.io-client';
import { resolveSocketUrl } from './network';
import { getAccessToken } from './authStorage';

const SOCKET_URL = resolveSocketUrl();

type SocketHandler = (socket: Socket) => void;

export async function createRealtimeClient(onReady?: SocketHandler) {
  const token = await getAccessToken();
  const socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 10000
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
