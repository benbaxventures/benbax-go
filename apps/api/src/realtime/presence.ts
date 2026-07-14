/**
 * In-memory registry of passengers ("clients") who are currently online in the
 * request app, plus a small geo helper so the socket layer can tell a driver
 * which passengers are within their pickup radius.
 *
 * This is intentionally in-process (not Redis-backed): presence is ephemeral and
 * only meaningful while a socket is connected to this instance. If the API is
 * ever scaled to multiple nodes, promote this to a shared store.
 */

export type OnlineClient = {
  /** The passenger's user id. */
  id: string;
  latitude: number;
  longitude: number;
  name?: string;
  serviceClass?: 'economy' | 'comfort' | 'premium';
  /** ISO timestamp of when the passenger came online. */
  since: string;
};

/** A passenger enriched with straight-line distance from a given driver. */
export type NearbyClient = OnlineClient & { distanceKm: number };

const EARTH_RADIUS_KM = 6371;

const onlineClients = new Map<string, OnlineClient>();

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two coordinates, in kilometres. */
export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Records (or refreshes) a passenger as online. Returns the stored record plus
 * whether this was their first appearance, so callers can distinguish a brand
 * new arrival from a routine location update.
 */
export function upsertOnlineClient(input: {
  id: string;
  latitude: number;
  longitude: number;
  name?: string;
  serviceClass?: OnlineClient['serviceClass'];
}): { client: OnlineClient; isNew: boolean } {
  const existing = onlineClients.get(input.id);
  const client: OnlineClient = {
    id: input.id,
    latitude: input.latitude,
    longitude: input.longitude,
    ...(input.name ? { name: input.name } : {}),
    ...(input.serviceClass ? { serviceClass: input.serviceClass } : {}),
    since: existing?.since ?? new Date().toISOString(),
  };
  onlineClients.set(input.id, client);
  return { client, isNew: !existing };
}

/** Removes a passenger from the online registry. Returns true if one existed. */
export function removeOnlineClient(id: string): boolean {
  return onlineClients.delete(id);
}

export function getOnlineClient(id: string): OnlineClient | undefined {
  return onlineClients.get(id);
}

/**
 * Returns every online passenger within `radiusKm` of the given point, each
 * annotated with distance and sorted nearest-first.
 */
export function clientsNear(
  point: { latitude: number; longitude: number },
  radiusKm: number
): NearbyClient[] {
  const results: NearbyClient[] = [];
  for (const client of onlineClients.values()) {
    const distanceKm = haversineKm(point, client);
    if (distanceKm <= radiusKm) {
      results.push({ ...client, distanceKm: Math.round(distanceKm * 10) / 10 });
    }
  }
  return results.sort((a, b) => a.distanceKm - b.distanceKm);
}
