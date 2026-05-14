import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { apiRequest } from '../services/api';

const RIDER_LOCATION_TASK = 'benbax-rider-location-task';
const ACTIVE_DELIVERY_KEY = 'benbax.rider.activeDeliveryId';

TaskManager.defineTask(RIDER_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn(error);
    return;
  }

  const deliveryId = await AsyncStorage.getItem(ACTIVE_DELIVERY_KEY);
  const locations = (data as { locations?: Location.LocationObject[] }).locations ?? [];
  const position = locations[0];
  if (!deliveryId || !position) return;

  const batteryLevel = await readBatteryPercent();
  apiRequest(`/tracking/deliveries/${deliveryId}/points`, {
    method: 'POST',
    body: JSON.stringify({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      heading: position.coords.heading ?? undefined,
      speedKph: position.coords.speed ? position.coords.speed * 3.6 : undefined,
      batteryLevel,
      source: 'BACKGROUND_GPS'
    })
  }).catch(console.warn);
});

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

      const backgroundPermission = await Location.requestBackgroundPermissionsAsync();
      if (backgroundPermission.granted) {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(RIDER_LOCATION_TASK);
        if (!isRegistered) {
          await Location.startLocationUpdatesAsync(RIDER_LOCATION_TASK, {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 75,
            timeInterval: 30_000,
            foregroundService: {
              notificationTitle: 'Benbax delivery tracking',
              notificationBody: 'Your active delivery location is being shared for safety.'
            },
            pausesUpdatesAutomatically: false,
            showsBackgroundLocationIndicator: true
          });
        }
      }
    }

    start().catch(console.warn);

    return () => {
      subscription?.remove();
      TaskManager.isTaskRegisteredAsync(RIDER_LOCATION_TASK)
        .then((isRegistered) => {
          if (isRegistered) return Location.stopLocationUpdatesAsync(RIDER_LOCATION_TASK);
          return undefined;
        })
        .then(() => AsyncStorage.removeItem(ACTIVE_DELIVERY_KEY))
        .catch(console.warn);
    };
  }, [deliveryId, enabled]);
}

async function readBatteryPercent() {
  const batteryLevel = await Battery.getBatteryLevelAsync();
  if (batteryLevel < 0) return undefined;
  return Math.round(batteryLevel * 100);
}
