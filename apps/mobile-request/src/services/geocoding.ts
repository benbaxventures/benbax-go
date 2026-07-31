// Forward geocoding: turn a place name the customer types or taps ("Ashaiman")
// into real map coordinates so the map can move there. Best-effort and never
// throws — callers treat `null` as "couldn't resolve".

export type GeoPoint = { latitude: number; longitude: number };
export type GeoResult = GeoPoint & { label: string };

const MIN_QUERY_LENGTH = 3;
const GOOGLE_TIMEOUT_MS = 8000;

// Bias free-text queries to Ghana so a bare town name ("Ashaiman") resolves to
// the Ghanaian place instead of a same-named location elsewhere.
function withCountryBias(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return trimmed;
  return /ghana/i.test(trimmed) ? trimmed : `${trimmed}, Ghana`;
}

async function geocodeViaExpo(query: string): Promise<GeoPoint | null> {
  let Location: typeof import('expo-location'); // eslint-disable-line @typescript-eslint/consistent-type-imports
  try {
    Location = await import('expo-location');
  } catch {
    return null;
  }

  try {
    const results = await Location.geocodeAsync(query);
    const first = results?.[0];
    if (!first || typeof first.latitude !== 'number' || typeof first.longitude !== 'number') {
      return null;
    }
    return { latitude: first.latitude, longitude: first.longitude };
  } catch {
    return null;
  }
}

type GoogleGeocodeResponse = {
  status: string;
  results: Array<{
    formatted_address?: string;
    geometry?: { location?: { lat: number; lng: number } };
  }>;
};

async function geocodeViaGoogle(query: string, apiKey: string): Promise<GeoResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_TIMEOUT_MS);
  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}` +
      `&region=gh&key=${apiKey}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const body = (await response.json()) as GoogleGeocodeResponse;
    const first = body.status === 'OK' ? body.results?.[0] : undefined;
    const location = first?.geometry?.location;
    if (!location) return null;

    return {
      latitude: location.lat,
      longitude: location.lng,
      label: first?.formatted_address ?? query,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resolve a place name to coordinates. Tries the on-device geocoder first (no
 * key required), then falls back to the Google Geocoding API when a Maps key is
 * configured. Returns null when the place cannot be found.
 */
export async function geocodePlace(query: string): Promise<GeoResult | null> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return null;

  const biased = withCountryBias(trimmed);

  const viaExpo = await geocodeViaExpo(biased);
  if (viaExpo) return { ...viaExpo, label: trimmed };

  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    const viaGoogle = await geocodeViaGoogle(biased, apiKey);
    if (viaGoogle) return viaGoogle;
  }

  return null;
}
