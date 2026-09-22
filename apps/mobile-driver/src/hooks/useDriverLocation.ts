import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { apiRequest } from '../services/api';

const ACTIVE_TRIP_KEY = 'benbax.driver.activeTripId';

/**
 * Minimum gap between tracking points sent to the API.
 *
 * The GPS watcher below fires about every 8 seconds while the car is moving.
 * Posting each one is ~110 requests per 15 minutes from a single driver on a
 * single trip — a large share of that driver's whole request budget, spent on
 * a resolution nobody looks at. Passengers follow the car over the socket,
 * which is unaffected by this; these points are the persisted trail.
 */
const TRACKING_POINT_MIN_INTERVAL_MS = 15_000;
/** ~30 m: below this the car has not meaningfully moved. */
const TRACKING_POINT_MIN_METERS = 30;

function metersBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 6_371_000 * 2 * Math.asin(Math.sqrt(h));
}

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
    let lastSent: { at: number; latitude: number; longitude: number } | null = null;
    // Guards against a slow request being overtaken by the next GPS fix and
    // piling several identical POSTs onto the same trip.
    let inFlight = false;

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
          if (inFlight) return;
          const point = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          const now = Date.now();
          if (lastSent) {
            if (now - lastSent.at < TRACKING_POINT_MIN_INTERVAL_MS) return;
            if (metersBetween(lastSent, point) < TRACKING_POINT_MIN_METERS) return;
          }
          lastSent = { at: now, ...point };
          inFlight = true;

          const batteryLevel = await readBatteryPercent();
          apiRequest(`/tracking/rides/${activeTripId}/points`, {
            method: 'POST',
            background: true,
            body: JSON.stringify({
              ...point,
              heading: position.coords.heading ?? undefined,
              speedKph: position.coords.speed ? position.coords.speed * 3.6 : undefined,
              batteryLevel,
              source: 'FOREGROUND_GPS',
            }),
          })
            .catch(console.warn)
            .finally(() => {
              inFlight = false;
            });
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
