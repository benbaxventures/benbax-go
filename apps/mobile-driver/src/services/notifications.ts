import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiRequest } from './api';

const ANDROID_OFFER_CHANNEL_ID = 'ride-offers';

/**
 * Controls how a notification is presented while the app is foregrounded.
 * Ride/delivery offers are time-critical, so we show a banner and play a sound.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function getProjectId(): string | undefined {
  const easProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  return typeof easProjectId === 'string' ? easProjectId : undefined;
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_OFFER_CHANNEL_ID, {
    name: 'Ride & delivery offers',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
  });
}

/**
 * Requests notification permission, obtains the Expo push token, and registers
 * it with the backend so the server can push ride/delivery offers to this device.
 * Returns the push token on success, or null if unavailable (emulator, denied
 * permission, or a transient failure). Never throws.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    // Push tokens are only issued on physical devices.
    if (!Device.isDevice) return null;

    await ensureAndroidChannel();

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return null;

    const projectId = getProjectId();
    if (!projectId) {
      console.warn('[push] Missing EAS projectId; cannot request an Expo push token');
      return null;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return null;

    await apiRequest('/notifications/device-tokens', {
      method: 'POST',
      body: JSON.stringify({
        token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
      }),
    });

    return token;
  } catch (err) {
    console.warn('[push] Failed to register for push notifications:', err);
    return null;
  }
}

type LocalOffer = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

/**
 * Fires an immediate local notification. Used as a fallback so realtime offers
 * received over the foreground socket still surface a heads-up banner / sound /
 * tray entry, even before the backend sends a server push.
 */
export async function presentLocalOffer({ title, body, data }: LocalOffer): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data ?? {},
        sound: 'default',
      },
      // A channel-aware trigger fires immediately while routing the Android
      // notification through our high-importance offer channel. iOS uses null.
      trigger: Platform.OS === 'android' ? { channelId: ANDROID_OFFER_CHANNEL_ID } : null,
    });
  } catch (err) {
    console.warn('[push] Failed to present local offer notification:', err);
  }
}
