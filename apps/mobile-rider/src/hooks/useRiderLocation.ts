import { useEffect } from 'react';
import * as Location from 'expo-location';
import { apiRequest } from '../services/api';

export function useRiderLocation(deliveryId?: string, enabled = false) {
  useEffect(() => {
    if (!enabled || !deliveryId) return;

    let subscription: Location.LocationSubscription | null = null;

    async function start() {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return;

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 30,
          timeInterval: 8_000
        },
        (position) => {
          apiRequest(`/tracking/deliveries/${deliveryId}/points`, {
            method: 'POST',
            body: JSON.stringify({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              heading: position.coords.heading,
              speedKph: position.coords.speed ? position.coords.speed * 3.6 : undefined
            })
          }).catch(console.warn);
        }
      );
    }

    start().catch(console.warn);

    return () => {
      subscription?.remove();
    };
  }, [deliveryId, enabled]);
}
