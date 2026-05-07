import AsyncStorage from '@react-native-async-storage/async-storage';
import { io } from 'socket.io-client';

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL ?? 'http://localhost:4000';

export async function createRealtimeClient() {
  const token = await AsyncStorage.getItem('benbax.accessToken');
  return io(SOCKET_URL, {
    transports: ['websocket'],
    auth: { token }
  });
}
