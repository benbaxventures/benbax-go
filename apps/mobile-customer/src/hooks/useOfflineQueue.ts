import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'benbax.offlineQueue';

export type QueuedAction = {
  id: string;
  type: 'CREATE_DELIVERY' | 'SUPPORT_TICKET';
  payload: Record<string, unknown>;
  createdAt: string;
};

export async function enqueueOfflineAction(action: QueuedAction) {
  let queue: QueuedAction[];
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    queue = raw ? (JSON.parse(raw) as QueuedAction[]) : [];
  } catch {
    queue = [];
  }
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([...queue, action]));
}

export async function readOfflineQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedAction[]) : [];
  } catch {
    return [];
  }
}

export async function clearOfflineQueue() {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
