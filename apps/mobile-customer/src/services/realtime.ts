import { io } from 'socket.io-client';
import { getAccessToken } from './authStorage';

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL ?? 'http://localhost:4000';

export async function createRealtimeClient() {
  const token = await getAccessToken();
  return io(SOCKET_URL, {
    transports: ['websocket'],
    auth: { token }
  });
}
