import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { apiRequest } from '../services/api';

const ACTIVE_TRIP_KEY = 'benbax.driver.activeTripId';

async function loadLocation() {
  try {
    return await import('expo-location');
  } catch {
    console.warn('expo-location native module is not available in this runtime.');
    return null;
  }
}

export function useDriverLocation(tripId?: string, enabled = false) {
  useEffect(() => {
    if (!enabled || !tripId) return;
    const activeTripId = tripId;

    let subscription: { remove: () => void } | null = null;

    async function start() {
      const Location = await loadLocation();
      if (!Location) return;

      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return;
      await AsyncStorage.setItem(ACTIVE_TRIP_KEY, activeTripId);

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 30,
          timeInterval: 8_000,
        },
        async (position) => {
          const batteryLevel = await readBatteryPercent();
          apiRequest(`/tracking/rides/${activeTripId}/points`, {
            method: 'POST',
            body: JSON.stringify({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              heading: position.coords.heading ?? undefined,
              speedKph: position.coords.speed ? position.coords.speed * 3.6 : undefined,
              batteryLevel,
              source: 'FOREGROUND_GPS',
            }),
          }).catch(console.warn);
        }
      );
    }

    start().catch(console.warn);

    return () => {
      subscription?.remove();
      AsyncStorage.removeItem(ACTIVE_TRIP_KEY).catch(console.warn);
    };
  }, [tripId, enabled]);
}

async function readBatteryPercent() {
  return undefined;
}
