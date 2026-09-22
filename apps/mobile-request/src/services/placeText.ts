// Pure text helpers behind the location-naming service: deciding what counts as
// a Plus Code and which of several candidate strings a person would actually
// understand.
//
// Kept free of React Native, Expo and network imports so the rules can be
// exercised on their own (see scripts/verify-place-text.ts) — `placeName.ts`
// re-exports everything here, so callers import from there as usual.
//
// Mirrored in apps/mobile-driver/src/services/placeText.ts. Keep the two in sync.

export type ResolvedPlace = {
  /** Source of truth — never replaced by the display name. */
  latitude: number;
  longitude: number;
  /** Short name for the UI: "Church of Pentecost", "Spintex Road", "Golf Estate". */
  placeName: string;
  /** Nearest recognisable establishment/POI, when one was identified. */
  landmark: string | null;
  /** Neighbourhood / community / suburb: "Golf Estate", "Community 25". */
  area: string | null;
  /** City or town: "Tema", "Accra", "Kumasi". */
  city: string | null;
  /** Full address line, used as secondary text. Never a bare Plus Code. */
  formattedAddress: string;
  /**
   * Which tier of the ladder produced `placeName`, best first:
   * establishment/POI → nearby landmark → street → neighbourhood → city →
   * on-device geocoder → last good name → Plus Code → bare coordinates.
   */
  source:
    | 'poi'
    | 'landmark'
    | 'route'
    | 'area'
    | 'city'
    | 'device'
    | 'cached'
    | 'plus-code'
    | 'coordinates';
  /** True when we could not do better than a Plus Code / raw coordinates. */
  isFallback: boolean;
};

/** What the UI shows while the first reverse-geocode is still in flight. */
export const RESOLVING_PLACE_LABEL = 'Finding your location…';

/** Shown when no provider could name the point at all. */
export const UNNAMED_PLACE_LABEL = 'Pinned location';

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in metres. The only distance maths this module needs. */
export function metersBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Open Location Code alphabet. A global code is "6FR9Q2X5+W2R"; the short form
// Google shows next to a town is "Q2X5+W2R". No real street or place name in
// Ghana contains a "+", so this is a safe test.
const PLUS_CODE_TOKEN = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}$/i;

/** True when the text is (or starts with) a Google Plus Code such as "Q2X5+W2R". */
export function isPlusCode(value?: string | null): boolean {
  if (!value) return false;
  const [first] = value.trim().split(/\s+/);
  const token = first?.replace(/,$/, '') ?? '';
  return token.length > 0 && PLUS_CODE_TOKEN.test(token);
}

/** "Q2X5+W2R, Tema, Ghana" → "Tema, Ghana". Returns null when nothing is left. */
export function stripPlusCode(value?: string | null): string | null {
  if (!value) return null;
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !isPlusCode(part));
  const joined = parts.join(', ');
  return joined.length > 0 ? joined : null;
}

/**
 * Picks the first value a normal user would understand, skipping Plus Codes and
 * blanks. Use this at any render site that shows a location label which may have
 * been stored before this module existed (older trips, other clients).
 *
 * The Plus Code is only returned when literally nothing else is available.
 */
export function displayPlaceLabel(...candidates: Array<string | null | undefined>): string {
  let plusCodeFallback: string | null = null;
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) continue;
    // "Q2X5+W2R, Golf Estate" is still usable once the code is dropped.
    const stripped = stripPlusCode(value);
    if (stripped) return stripped;
    plusCodeFallback ??= value;
  }
  return plusCodeFallback ?? UNNAMED_PLACE_LABEL;
}

/** "Church of Pentecost" + "Golf Estate" → "Church of Pentecost, Golf Estate". */
export function formatPlaceLabel(place: ResolvedPlace | null): string | null {
  if (!place) return null;
  const context = [place.area, place.city].find(
    (part) => part && part.toLowerCase() !== place.placeName.toLowerCase()
  );
  return context ? `${place.placeName}, ${context}` : place.placeName;
}
