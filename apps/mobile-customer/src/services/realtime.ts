import { io } from 'socket.io-client';
import { resolveSocketUrl } from './network';
import { getAccessToken } from './authStorage';

const SOCKET_URL = resolveSocketUrl();

export async function createRealtimeClient() {
  const token = await getAccessToken();
  return io(SOCKET_URL, {
    transports: ['websocket'],
    auth: { token }
  });
}
