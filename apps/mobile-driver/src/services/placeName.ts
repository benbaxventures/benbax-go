// Turns raw GPS coordinates into a name a Ghanaian driver actually
// recognises — "Church of Pentecost, Golf Estate" rather than "Q2X5+W2R".
//
// Coordinates stay the source of truth everywhere else in the app (matching,
// distance, ETA, navigation, geofencing). This module only decides what the
// *human* sees, and it is the single place in the app that does so.
//
// Provider: the Google Maps key the project already uses
// (EXPO_PUBLIC_GOOGLE_MAPS_API_KEY / expoConfig.extra.googleMapsApiKey), with
// the on-device geocoder as a no-key fallback. No second provider.
//
// This file is mirrored in apps/mobile-request/src/services/placeName.ts so both
// apps name locations identically. Keep the two in sync.

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import {
  isPlusCode,
  metersBetween,
  stripPlusCode,
  UNNAMED_PLACE_LABEL,
  type ResolvedPlace,
} from './placeText';

export {
  displayPlaceLabel,
  formatPlaceLabel,
  isPlusCode,
  metersBetween,
  RESOLVING_PLACE_LABEL,
  stripPlusCode,
  UNNAMED_PLACE_LABEL,
  type ResolvedPlace,
} from './placeText';

const GOOGLE_TIMEOUT_MS = 8000;
/** Resolved names are reused for this long before being looked up again. */
const CACHE_TTL_MS = 10 * 60 * 1000;
/** A failed lookup is remembered briefly so a bad network isn't hammered. */
const NEGATIVE_TTL_MS = 60 * 1000;
const CACHE_LIMIT = 120;
/** Cache grid, in degrees (~55 m). Anything inside one cell shares a name. */
const CACHE_GRID_DEG = 0.0005;
/** A Places landmark further than this is not "where you are". */
const LANDMARK_MAX_METERS = 300;
/** The last good name is only reused for a point this close to where it was taken. */
const LAST_KNOWN_MAX_METERS = 2000;
const LAST_KNOWN_KEY = 'benbax.lastKnownPlace';
/** Don't rewrite the persisted last-known place more often than this. */
const LAST_KNOWN_WRITE_INTERVAL_MS = 30 * 1000;

// ---------------------------------------------------------------------------
// Google Geocoding / Places
// ---------------------------------------------------------------------------

function googleApiKey(): string | null {
  const fromExtra = Constants.expoConfig?.extra?.googleMapsApiKey;
  const key =
    (typeof fromExtra === 'string' && fromExtra) || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  // Unreplaced placeholders ("${EXPO_PUBLIC_...}", "your-key-here") are not keys.
  if (!key || key.startsWith('${') || key.startsWith('your-')) return null;
  return key;
}

type AddressComponent = { long_name: string; short_name: string; types: string[] };

type GoogleReverseResponse = {
  status: string;
  results?: Array<{
    formatted_address?: string;
    types?: string[];
    address_components?: AddressComponent[];
  }>;
};

type GooglePlacesNearbyResponse = {
  status: string;
  results?: Array<{
    name?: string;
    vicinity?: string;
    geometry?: { location?: { lat: number; lng: number } };
  }>;
};

// Ordered best → worst. A component is only accepted when it is not a Plus Code.
const POI_TYPES = [
  'point_of_interest',
  'establishment',
  'premise',
  'church',
  'place_of_worship',
  'hospital',
  'school',
  'university',
  'shopping_mall',
  'transit_station',
  'bus_station',
  'airport',
  'park',
];
const ROUTE_TYPES = ['route'];
const AREA_TYPES = ['neighborhood', 'sublocality_level_1', 'sublocality', 'sublocality_level_2'];
const CITY_TYPES = ['locality', 'postal_town', 'administrative_area_level_2'];

function pickComponent(components: AddressComponent[], types: string[]): string | null {
  for (const type of types) {
    const match = components.find(
      (component) => component.types.includes(type) && !isPlusCode(component.long_name)
    );
    if (match?.long_name) return match.long_name;
  }
  return null;
}

// Deliberately takes no caller-supplied AbortSignal: one lookup is shared by
// every consumer of the same map cell, so letting one of them cancel it would
// degrade the others — and poison the cache with a failure they never caused.
// Callers that lose interest simply ignore the result; the internal timeout is
// what stops a hung request.
async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    // Offline or timed out — the caller falls back a tier.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

type GeocodeParts = {
  poi: string | null;
  route: string | null;
  area: string | null;
  city: string | null;
  formattedAddress: string | null;
  /** Kept aside, never shown, unless every readable tier came up empty. */
  plusCode: string | null;
};

/**
 * One reverse-geocode call, read across *all* returned results rather than just
 * the first — Google often puts the establishment in a later result than the
 * street address.
 */
async function reverseGeocodeViaGoogle(
  latitude: number,
  longitude: number,
  apiKey: string
): Promise<GeocodeParts | null> {
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}` +
    `&region=gh&language=en&key=${encodeURIComponent(apiKey)}`;
  const body = await fetchJson<GoogleReverseResponse>(url);
  if (!body || body.status !== 'OK' || !body.results?.length) return null;

  const parts: GeocodeParts = {
    poi: null,
    route: null,
    area: null,
    city: null,
    formattedAddress: null,
    plusCode: null,
  };

  for (const result of body.results) {
    const components = result.address_components ?? [];
    parts.poi ??= pickComponent(components, POI_TYPES);
    parts.route ??= pickComponent(components, ROUTE_TYPES);
    parts.area ??= pickComponent(components, AREA_TYPES);
    parts.city ??= pickComponent(components, CITY_TYPES);
    parts.formattedAddress ??= stripPlusCode(result.formatted_address);
    if (!parts.plusCode && isPlusCode(result.formatted_address)) {
      parts.plusCode = result.formatted_address?.split(',')[0]?.trim() ?? null;
    }
  }

  return parts;
}

/**
 * Nearest named establishment, used only when the geocoder gave us nothing a
 * person would recognise. Places costs several times what Geocoding does, so it
 * is deliberately the exception, not the rule.
 */
async function nearestLandmarkViaPlaces(
  latitude: number,
  longitude: number,
  apiKey: string
): Promise<string | null> {
  const url =
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}` +
    `&rankby=distance&type=point_of_interest&language=en&key=${encodeURIComponent(apiKey)}`;
  const body = await fetchJson<GooglePlacesNearbyResponse>(url);
  if (!body || body.status !== 'OK') return null;

  for (const result of body.results ?? []) {
    const name = result.name?.trim();
    const location = result.geometry?.location;
    if (!name || isPlusCode(name) || !location) continue;
    const distance = metersBetween(
      { latitude, longitude },
      { latitude: location.lat, longitude: location.lng }
    );
    if (distance <= LANDMARK_MAX_METERS) return name;
    // rankby=distance returns nearest first, so the first miss ends the search.
    return null;
  }
  return null;
}

/** On-device geocoder — works with no API key, but is coarse and often returns Plus Codes. */
async function reverseGeocodeViaDevice(
  latitude: number,
  longitude: number
): Promise<GeocodeParts | null> {
  try {
    const Location = await import('expo-location');
    const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (!place) return null;

    const clean = (value?: string | null) =>
      value && !isPlusCode(value) ? value.trim() || null : null;

    const parts: GeocodeParts = {
      poi: clean(place.name),
      route: clean(place.street),
      area: clean(place.district) ?? clean(place.subregion),
      city: clean(place.city),
      formattedAddress: null,
      // On Android this is usually where the Plus Code turns up. Hold on to it
      // for the bottom of the ladder instead of throwing it away.
      plusCode: isPlusCode(place.name) ? (place.name?.trim() ?? null) : null,
    };
    const address = [parts.poi, parts.route, parts.area, parts.city, clean(place.region)]
      .filter((part, index, all) => part && all.indexOf(part) === index)
      .join(', ');
    parts.formattedAddress = address || null;
    return parts.poi || parts.route || parts.area || parts.city || parts.plusCode ? parts : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cache: in-memory grid + in-flight dedupe + persisted last-known place
// ---------------------------------------------------------------------------

type CacheEntry = { place: ResolvedPlace | null; expiresAt: number };

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ResolvedPlace>>();

function cellKey(latitude: number, longitude: number): string {
  return `${Math.round(latitude / CACHE_GRID_DEG)}:${Math.round(longitude / CACHE_GRID_DEG)}`;
}

function readCache(key: string): ResolvedPlace | null | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.place;
}

function writeCache(key: string, place: ResolvedPlace | null) {
  if (cache.size >= CACHE_LIMIT) {
    // Map preserves insertion order, so the first key is the oldest.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, {
    place,
    expiresAt: Date.now() + (place ? CACHE_TTL_MS : NEGATIVE_TTL_MS),
  });
}

let lastKnown: ResolvedPlace | null = null;
let lastKnownWrittenAt = 0;
let lastKnownLoad: Promise<ResolvedPlace | null> | null = null;

/** The most recent successfully-named place, surviving app restarts. */
export async function getLastKnownPlace(): Promise<ResolvedPlace | null> {
  if (lastKnown) return lastKnown;
  lastKnownLoad ??= AsyncStorage.getItem(LAST_KNOWN_KEY)
    .then((raw) => {
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ResolvedPlace;
      if (typeof parsed?.latitude !== 'number' || typeof parsed?.placeName !== 'string') {
        return null;
      }
      lastKnown = parsed;
      return parsed;
    })
    .catch(() => null);
  return lastKnownLoad;
}

function rememberPlace(place: ResolvedPlace) {
  if (place.isFallback) return;
  lastKnown = place;
  const now = Date.now();
  if (now - lastKnownWrittenAt < LAST_KNOWN_WRITE_INTERVAL_MS) return;
  lastKnownWrittenAt = now;
  void AsyncStorage.setItem(LAST_KNOWN_KEY, JSON.stringify(place)).catch(() => undefined);
}

/** Drops every cached name. Exposed for tests and for a hard "relocate me". */
export function clearPlaceCache() {
  cache.clear();
  inFlight.clear();
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

function buildPlace(
  latitude: number,
  longitude: number,
  parts: GeocodeParts,
  landmark: string | null,
  source: ResolvedPlace['source']
): ResolvedPlace {
  const poi = landmark ?? parts.poi;
  const placeName = poi ?? parts.route ?? parts.area ?? parts.city ?? UNNAMED_PLACE_LABEL;
  const composed = [poi, parts.route, parts.area, parts.city]
    .filter((part, index, all) => part && all.indexOf(part) === index)
    .join(', ');
  const formattedAddress = parts.formattedAddress ?? composed;

  return {
    latitude,
    longitude,
    placeName,
    landmark: poi,
    area: parts.area,
    city: parts.city,
    formattedAddress: formattedAddress || placeName,
    source,
    isFallback: false,
  };
}

/**
 * The bottom of the ladder. A Plus Code is only reached here — after every
 * readable tier has come up empty — and only when a provider actually gave us
 * one; otherwise the passenger sees a neutral label rather than coordinates
 * dressed up as a place name. Either way `isFallback` tells callers not to
 * cache or persist this as a real name.
 */
function lastResortPlace(
  latitude: number,
  longitude: number,
  plusCode: string | null = null
): ResolvedPlace {
  return {
    latitude,
    longitude,
    placeName: plusCode ?? UNNAMED_PLACE_LABEL,
    landmark: null,
    area: null,
    city: null,
    formattedAddress: plusCode ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
    source: plusCode ? 'plus-code' : 'coordinates',
    isFallback: true,
  };
}

async function resolve(
  latitude: number,
  longitude: number,
  allowLandmarkSearch: boolean
): Promise<ResolvedPlace> {
  const apiKey = googleApiKey();
  // Anything a provider hands back that is only a Plus Code is parked here and
  // used at step 8, never before.
  let plusCode: string | null = null;

  // 1–5. Google Geocoding: establishment → street → neighbourhood → city.
  if (apiKey) {
    const parts = await reverseGeocodeViaGoogle(latitude, longitude, apiKey);
    if (parts) {
      plusCode ??= parts.plusCode;
      if (parts.poi) return buildPlace(latitude, longitude, parts, null, 'poi');
      if (parts.route) return buildPlace(latitude, longitude, parts, null, 'route');

      // Nothing recognisable yet — one Places call to find the nearest landmark.
      if (allowLandmarkSearch) {
        const landmark = await nearestLandmarkViaPlaces(latitude, longitude, apiKey);
        if (landmark) return buildPlace(latitude, longitude, parts, landmark, 'landmark');
      }

      if (parts.area) return buildPlace(latitude, longitude, parts, null, 'area');
      if (parts.city) return buildPlace(latitude, longitude, parts, null, 'city');
    }
  }

  // 6. On-device geocoder (no key needed, coarser).
  const devicePlace = await reverseGeocodeViaDevice(latitude, longitude);
  if (devicePlace) {
    plusCode ??= devicePlace.plusCode;
    if (devicePlace.poi || devicePlace.route || devicePlace.area || devicePlace.city) {
      return buildPlace(latitude, longitude, devicePlace, null, 'device');
    }
  }

  // 7. Reuse the last name we resolved, when it was taken close enough to here.
  const previous = await getLastKnownPlace();
  if (previous && metersBetween(previous, { latitude, longitude }) <= LAST_KNOWN_MAX_METERS) {
    return { ...previous, latitude, longitude, source: 'cached' };
  }

  // 8. Give up on naming — coordinates still drive the booking itself.
  return lastResortPlace(latitude, longitude, plusCode);
}

/**
 * Names a coordinate. Never throws and never returns null: when every provider
 * fails the caller still gets a usable object whose `isFallback` is true, so the
 * booking flow keeps working on latitude/longitude alone.
 *
 * Repeat calls for the same ~55 m cell are served from cache, and concurrent
 * calls for one cell share a single network request.
 */
export async function describePlace(
  latitude: number,
  longitude: number,
  options?: { allowLandmarkSearch?: boolean }
): Promise<ResolvedPlace> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return lastResortPlace(latitude || 0, longitude || 0);
  }

  const key = cellKey(latitude, longitude);
  const cached = readCache(key);
  if (cached) return { ...cached, latitude, longitude };
  if (cached === null) return lastResortPlace(latitude, longitude);

  const existing = inFlight.get(key);
  if (existing) return existing;

  const pending = resolve(latitude, longitude, options?.allowLandmarkSearch ?? true)
    .then((place) => {
      writeCache(key, place.isFallback ? null : place);
      if (!place.isFallback) rememberPlace(place);
      return place;
    })
    .catch(() => lastResortPlace(latitude, longitude))
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, pending);
  return pending;
}

/** Convenience wrapper for callers that only want the display string. */
export async function getHumanReadableLocation(
  latitude: number,
  longitude: number
): Promise<string> {
  const place = await describePlace(latitude, longitude);
  return place.placeName;
}
