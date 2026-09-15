import Constants from 'expo-constants';

export type RouteCoordinate = { latitude: number; longitude: number };

type RouteResult = {
  coordinates: RouteCoordinate[];
  distanceMeters: number;
  durationSeconds: number;
};

function decodePolyline(encoded: string): RouteCoordinate[] {
  const points: RouteCoordinate[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    latitude += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    longitude += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }
  return points;
}

export async function fetchDrivingRoute(
  origin: RouteCoordinate,
  destination: RouteCoordinate
): Promise<RouteResult> {
  const key = Constants.expoConfig?.extra?.googleMapsApiKey;
  if (typeof key === 'string' && key && !key.startsWith('your-')) {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&mode=driving&key=${encodeURIComponent(key)}`
      );
      const data = (await response.json()) as {
        routes?: Array<{
          overview_polyline?: { points?: string };
          legs?: Array<{ distance?: { value?: number }; duration?: { value?: number } }>;
        }>;
      };
      const route = data.routes?.[0];
      const leg = route?.legs?.[0];
      const coordinates = route?.overview_polyline?.points
        ? decodePolyline(route.overview_polyline.points)
        : [];
      if (coordinates.length > 1) {
        return {
          coordinates,
          distanceMeters: leg?.distance?.value ?? 0,
          durationSeconds: leg?.duration?.value ?? 0,
        };
      }
    } catch {
      // A straight-line preview keeps navigation usable when Directions is unavailable.
    }
  }
  const distanceMeters = haversineMeters(origin, destination);
  return {
    coordinates: [origin, destination],
    distanceMeters,
    durationSeconds: distanceMeters / 8.3,
  };
}

export function haversineMeters(a: RouteCoordinate, b: RouteCoordinate): number {
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
