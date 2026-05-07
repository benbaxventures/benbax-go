import { useEffect } from 'react';
import messaging from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import { apiRequest } from '../services/api';

export function useNotifications(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let mounted = true;

    async function registerToken() {
      const permission = await messaging().requestPermission();
      const allowed =
        permission === messaging.AuthorizationStatus.AUTHORIZED ||
        permission === messaging.AuthorizationStatus.PROVISIONAL;

      if (!allowed || !mounted) return;

      const token = await messaging().getToken();
      await apiRequest('/notifications/device-tokens', {
        method: 'POST',
        body: JSON.stringify({ token, platform: Platform.OS })
      });
    }

    registerToken().catch(console.warn);

    return () => {
      mounted = false;
    };
  }, [enabled]);
}
