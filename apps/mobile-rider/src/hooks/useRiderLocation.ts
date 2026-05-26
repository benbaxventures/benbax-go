import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { apiRequest } from '../services/api';

const ACTIVE_DELIVERY_KEY = 'benbax.rider.activeDeliveryId';

export function useRiderLocation(deliveryId?: string, enabled = false) {
  useEffect(() => {
    if (!enabled || !deliveryId) return;
    const activeDeliveryId = deliveryId;

    let subscription: Location.LocationSubscription | null = null;

    async function start() {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return;
      await AsyncStorage.setItem(ACTIVE_DELIVERY_KEY, activeDeliveryId);

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 30,
          timeInterval: 8_000
        },
        async (position) => {
          const batteryLevel = await readBatteryPercent();
          apiRequest(`/tracking/deliveries/${activeDeliveryId}/points`, {
            method: 'POST',
            body: JSON.stringify({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              heading: position.coords.heading ?? undefined,
              speedKph: position.coords.speed ? position.coords.speed * 3.6 : undefined,
              batteryLevel,
              source: 'FOREGROUND_GPS'
            })
          }).catch(console.warn);
        }
      );

    }

    start().catch(console.warn);

    return () => {
      subscription?.remove();
      AsyncStorage.removeItem(ACTIVE_DELIVERY_KEY).catch(console.warn);
    };
  }, [deliveryId, enabled]);
}

async function readBatteryPercent() {
  return undefined;
}
