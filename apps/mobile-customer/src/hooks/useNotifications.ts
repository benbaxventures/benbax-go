import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { apiRequest } from '../services/api';

export function useNotifications(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let mounted = true;

    async function registerToken() {
      const permission = await Notifications.requestPermissionsAsync();
      if (!permission.granted || !mounted) return;

      const token = await Notifications.getExpoPushTokenAsync();

      await apiRequest('/notifications/device-tokens', {
        method: 'POST',
        body: JSON.stringify({
          token: token.data,
          platform: Platform.OS
        })
      });
    }

    registerToken().catch(console.warn);

    return () => {
      mounted = false;
    };
  }, [enabled]);
}
