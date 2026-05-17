import AsyncStorage from '@react-native-async-storage/async-storage';
import { io } from 'socket.io-client';
import { resolveSocketUrl } from './network';

const SOCKET_URL = resolveSocketUrl();

export async function createRealtimeClient() {
  const token = await AsyncStorage.getItem('benbax.rider.accessToken');
  return io(SOCKET_URL, {
    transports: ['websocket'],
    auth: { token }
  });
}
