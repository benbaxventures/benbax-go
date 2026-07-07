import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { registerForPushNotifications } from '../services/notifications';

type PushNotificationOptions = {
  /** Only register + listen while the driver is authenticated. */
  enabled: boolean;
  /** Called when the driver taps a notification (foreground or background). */
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void;
};

/**
 * Registers the device's Expo push token with the backend once the driver is
 * authenticated, and wires notification-tap handling so tapping an offer routes
 * into the app. Registration runs once per authenticated session.
 */
export function usePushNotifications({ enabled, onNotificationResponse }: PushNotificationOptions) {
  const hasRegistered = useRef(false);
  // Keep the latest callback without re-subscribing the listener on every render.
  const responseHandler = useRef(onNotificationResponse);
  responseHandler.current = onNotificationResponse;

  useEffect(() => {
    if (!enabled) {
      hasRegistered.current = false;
      return;
    }

    if (!hasRegistered.current) {
      hasRegistered.current = true;
      void registerForPushNotifications();
    }

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      responseHandler.current?.(response);
    });

    return () => {
      responseSub.remove();
    };
  }, [enabled]);
}
