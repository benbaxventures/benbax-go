import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

export type RouteCoordinate = { latitude: number; longitude: number };

/** One turn-by-turn instruction from the Directions API. */
export type RouteStep = {
  instruction: string;
  distanceText: string;
  distanceMeters: number;
  end: RouteCoordinate;
  maneuver?: string;
};

export type RouteResult = {
  coordinates: RouteCoordinate[];
  distanceMeters: number;
  durationSeconds: number;
  steps: RouteStep[];
};

type DirectionsStep = {
  html_instructions?: string;
  distance?: { text?: string; value?: number };
  end_location?: { lat?: number; lng?: number };
  maneuver?: string;
};

function stripHtml(html: string) {
  return html
    .replace(/<div[^>]*>/gi, '. ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function toRouteSteps(steps: DirectionsStep[] | undefined): RouteStep[] {
  return (steps ?? [])
    .filter((s) => s.end_location?.lat != null && s.end_location?.lng != null)
    .map((s) => ({
      instruction: stripHtml(s.html_instructions ?? 'Continue'),
      distanceText: s.distance?.text ?? '',
      distanceMeters: s.distance?.value ?? 0,
      end: { latitude: Number(s.end_location!.lat), longitude: Number(s.end_location!.lng) },
      ...(s.maneuver ? { maneuver: s.maneuver } : {}),
    }));
}

/**
 * Hands the trip to Google Maps for full turn-by-turn voice navigation.
 * Android opens navigation mode directly; elsewhere the web directions URL.
 */
export async function openExternalNavigation(destination: RouteCoordinate) {
  const { latitude, longitude } = destination;
  const nativeUrl =
    Platform.OS === 'android'
      ? `google.navigation:q=${latitude},${longitude}&mode=d`
      : `comgooglemaps://?daddr=${latitude},${longitude}&directionsmode=driving`;
  const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
  // canOpenURL() reports false for undeclared intent schemes on Android 11+,
  // so just try the native URL and fall back if nothing handles it.
  try {
    await Linking.openURL(nativeUrl);
  } catch {
    await Linking.openURL(webUrl);
  }
}

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
          legs?: Array<{
            distance?: { value?: number };
            duration?: { value?: number };
            steps?: DirectionsStep[];
          }>;
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
          steps: toRouteSteps(leg?.steps),
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
    steps: [],
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
