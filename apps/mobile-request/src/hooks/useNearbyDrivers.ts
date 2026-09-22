import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../services/api';

/**
 * One online driver as the customer app knows them. Positions arrive on the
 * realtime stream; the extra detail (vehicle, rating, availability) comes from
 * `/drivers/nearby`, which reads the same live presence registry.
 */
export type NearbyDriver = {
  id: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  vehicleType?: string | null;
  /** "Silver Toyota Vitz" — never the plate number. */
  vehicleDescription?: string | null;
  /** False while the driver is already carrying a passenger. */
  available?: boolean;
  rating?: number | null;
  totalTrips?: number | null;
  /** ISO timestamp of when this driver came online. */
  since?: string;
  heading?: number;
  name?: string;
};

/** Great-circle distance in km between two coordinates. */
export function distanceKmBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Average city driving speed used to turn a straight-line distance into a
 * pickup ETA. Deliberately conservative for Accra/Tema traffic; the exact
 * number comes from the routed quote once a ride is actually requested.
 */
const PICKUP_SPEED_KPH = 22;

/** Minutes until this driver could reach the passenger, or null if unknown. */
export function pickupEtaMinutes(distanceKm: number): number | null {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return null;
  return Math.max(1, Math.round((distanceKm / PICKUP_SPEED_KPH) * 60));
}

/**
 * Renders a real measured distance. Nothing here invents a floor: below 20 m
 * the phone's own GPS accuracy is the limiting factor, so we say so instead of
 * printing a precise-looking number we cannot stand behind.
 */
export function formatDriverDistance(km: number): string {
  if (!Number.isFinite(km)) return '';
  if (km < 1) {
    const meters = Math.round(km * 1000);
    return meters < 20 ? 'under 20 m' : `${Math.round(meters / 10) * 10} m`;
  }
  return km >= 100 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
}

/** How often the REST safety net re-reads while the socket is streaming. */
const POLL_WHEN_LIVE_MS = 60_000;
/** …and while it is not (cold start, reconnecting, socket blocked). */
const POLL_WHEN_OFFLINE_MS = 10_000;

/**
 * REST view of the online drivers. This is the *fallback* for the realtime
 * stream plus the source of the per-driver detail the stream doesn't carry, so
 * it backs right off once the socket is live rather than polling every 10 s for
 * data the socket is already pushing.
 */
export function useNearbyDrivers(
  latitude: number | null,
  longitude: number | null,
  isFocused = true,
  isLive = false
) {
  const enabled = isFocused && latitude != null && longitude != null;
  const query = enabled
    ? `?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`
    : '';

  // The passenger's position is now watched continuously, so keying the cache
  // on raw coordinates would mint a new entry (and a new fetch) every few
  // metres. Round to ~1 km: the server returns every online driver regardless
  // of distance and the app recomputes distances locally, so a coarse key
  // refetches on real travel and stays put on GPS drift.
  const cellLat = enabled ? Math.round(latitude * 100) / 100 : null;
  const cellLng = enabled ? Math.round(longitude * 100) / 100 : null;

  return useQuery({
    queryKey: ['nearby-drivers', cellLat, cellLng],
    queryFn: () => apiRequest<NearbyDriver[]>(`/drivers/nearby${query}`),
    enabled,
    refetchInterval: enabled ? (isLive ? POLL_WHEN_LIVE_MS : POLL_WHEN_OFFLINE_MS) : false,
    // A backgrounded app cannot show the map, so polling it only spends the
    // request budget. And a failing fallback must not be retried on top of
    // its own interval — that is how one refused request becomes a stream.
    refetchIntervalInBackground: false,
    retry: false,
    staleTime: 5_000,
  });
}
