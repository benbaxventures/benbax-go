import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'benbax.offlineQueue';

export type QueuedAction = {
  id: string;
  type: 'CREATE_DELIVERY' | 'SUPPORT_TICKET';
  payload: Record<string, unknown>;
  createdAt: string;
};

export async function enqueueOfflineAction(action: QueuedAction) {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const queue = raw ? (JSON.parse(raw) as QueuedAction[]) : [];
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([...queue, action]));
}

export async function readOfflineQueue() {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as QueuedAction[]) : [];
}

export async function clearOfflineQueue() {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
