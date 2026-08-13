// Forward geocoding: turn a place name the customer types or taps ("Ashaiman")
// into real map coordinates so the map can move there. Best-effort and never
// throws — callers treat `null` as "couldn't resolve".

export type GeoPoint = { latitude: number; longitude: number };
export type GeoResult = GeoPoint & { label: string; formattedAddress?: string };
export type ReverseGeoResult = GeoPoint & { label: string; formattedAddress: string };

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
      ...(first?.formatted_address ? { formattedAddress: first.formatted_address } : {}),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resolve a place name to coordinates. Prefers the Google Geocoding API when a
 * Maps key is configured — it returns the real place name as the label — and
 * falls back to the on-device geocoder (no key required). Returns null when the
 * place cannot be found.
 */
export async function geocodePlace(query: string): Promise<GeoResult | null> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return null;

  const biased = withCountryBias(trimmed);

  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    const viaGoogle = await geocodeViaGoogle(biased, apiKey);
    if (viaGoogle) return viaGoogle;
  }

  const viaExpo = await geocodeViaExpo(biased);
  if (viaExpo) return { ...viaExpo, label: trimmed };

  return null;
}

type GoogleReverseResponse = {
  status: string;
  results: Array<{
    formatted_address?: string;
    address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
  }>;
};

// Prefer a landmark/street-level name over the city so map labels stay readable.
function buildReadableLabel(
  components: Array<{ long_name: string; short_name: string; types: string[] }>
): string | null {
  const pick = (...types: string[]) => {
    const match = components.find((comp) => comp.types.some((type) => types.includes(type)));
    return match?.long_name ?? null;
  };
  return (
    pick('establishment', 'point_of_interest', 'route', 'neighborhood', 'sublocality_level_1') ??
    pick('locality')
  );
}

async function reverseGeocodeViaGoogle(
  lat: number,
  lng: number,
  apiKey: string
): Promise<ReverseGeoResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_TIMEOUT_MS);
  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}` +
      `&result_type=route|neighborhood|sublocality_level_1|establishment|point_of_interest|locality` +
      `&region=gh&key=${apiKey}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const body = (await response.json()) as GoogleReverseResponse;
    const first = body.status === 'OK' ? body.results?.[0] : undefined;
    if (!first) return null;

    const label =
      buildReadableLabel(first.address_components ?? []) ??
      first.formatted_address?.split(',')[0]?.trim() ??
      'Selected location';
    return {
      latitude: lat,
      longitude: lng,
      label,
      formattedAddress: first.formatted_address ?? label,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Reverse-geocode a map coordinate into a readable place name ("Tetteh Quashie
 * Interchange", "Haatso Road") plus the full formatted address. Best-effort —
 * returns null when neither Google nor the on-device geocoder resolves.
 */
export async function reverseGeocodePoint(
  lat: number,
  lng: number
): Promise<ReverseGeoResult | null> {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    const viaGoogle = await reverseGeocodeViaGoogle(lat, lng, apiKey);
    if (viaGoogle) return viaGoogle;
  }

  try {
    const Location = await import('expo-location');
    const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (place) {
      const label =
        place.name || place.street || place.district || place.city || 'Selected location';
      const formattedAddress =
        [place.name, place.street, place.district, place.city, place.region, place.country]
          .filter(Boolean)
          .join(', ') || label;
      return { latitude: lat, longitude: lng, label, formattedAddress };
    }
  } catch {
    // fall through to null
  }

  return null;
}

// ---- Place autocomplete -----------------------------------------------
// Live suggestions while the customer types a pickup/dropoff, so the resolved
// coordinates are the real, selectable place — not a guess from a free-text
// geocode. Requires the Google "Places API" enabled for the Maps key.

export type PlaceSuggestion = { placeId: string; description: string };

type GooglePlacesAutocompleteResponse = {
  status: string;
  predictions?: Array<{ place_id?: string; description?: string }>;
};

type GooglePlaceDetailsResponse = {
  status: string;
  result?: {
    geometry?: { location?: { lat: number; lng: number } };
    formatted_address?: string;
  };
};

/**
 * Autocomplete a partially-typed place name into real Google Places suggestions,
 * biased to Ghana. Best-effort — returns [] when unavailable.
 */
export async function suggestPlaces(query: string): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_TIMEOUT_MS);
  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(trimmed)}` +
      `&components=country:gh&key=${apiKey}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return [];

    const body = (await response.json()) as GooglePlacesAutocompleteResponse;
    if (body.status !== 'OK' && body.status !== 'ZERO_RESULTS') return [];

    return (body.predictions ?? [])
      .map((prediction) => ({
        placeId: prediction.place_id ?? '',
        description: prediction.description ?? '',
      }))
      .filter((suggestion) => suggestion.placeId && suggestion.description)
      .slice(0, 5);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resolve a Google Place id into an exact coordinate plus its formatted
 * address. Returns null when the place cannot be resolved.
 */
export async function resolvePlaceId(placeId: string): Promise<GeoResult | null> {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_TIMEOUT_MS);
  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}` +
      `&fields=geometry,formatted_address&key=${apiKey}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const body = (await response.json()) as GooglePlaceDetailsResponse;
    const location = body.result?.geometry?.location;
    if (body.status !== 'OK' || !location) return null;

    const formattedAddress = body.result?.formatted_address;
    return {
      latitude: location.lat,
      longitude: location.lng,
      label: formattedAddress ?? 'Selected place',
      ...(formattedAddress ? { formattedAddress } : {}),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
