/**
 * In-memory registry of passengers ("clients") and drivers who are currently
 * online, plus a small geo helper so the socket layer can tell each side
 * about the other regardless of distance.
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
  /** Epoch ms of the last report/heartbeat; used to sweep dead connections. */
  lastSeenAt: number;
};

/** A passenger enriched with straight-line distance from a given driver. */
export type NearbyClient = OnlineClient & { distanceKm: number };

export type OnlineDriver = {
  /** The driver's user id. */
  id: string;
  latitude: number;
  longitude: number;
  vehicleType?: string;
  /** Driver's display name, shown on the customer map. */
  name?: string;
  heading?: number;
  /** ISO timestamp of when the driver came online. */
  since: string;
  /** Epoch ms of the last report/heartbeat; used to sweep dead connections. */
  lastSeenAt: number;
};

/** A driver enriched with straight-line distance from a given customer. */
export type NearbyDriverEntry = OnlineDriver & { distanceKm: number };

const EARTH_RADIUS_KM = 6371;

const onlineClients = new Map<string, OnlineClient>();
const onlineDrivers = new Map<string, OnlineDriver>();

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

// ---------------------------------------------------------------------------
// Client (passenger) presence
// ---------------------------------------------------------------------------

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
  const name = input.name ?? existing?.name;
  const client: OnlineClient = {
    id: input.id,
    latitude: input.latitude,
    longitude: input.longitude,
    ...(name ? { name } : {}),
    ...(input.serviceClass ? { serviceClass: input.serviceClass } : {}),
    since: existing?.since ?? new Date().toISOString(),
    lastSeenAt: Date.now(),
  };
  onlineClients.set(input.id, client);
  return { client, isNew: !existing };
}

/** Marks a passenger as still alive without changing their position. */
export function touchOnlineClient(id: string): boolean {
  const client = onlineClients.get(id);
  if (!client) return false;
  client.lastSeenAt = Date.now();
  return true;
}

/** Removes a passenger from the online registry. Returns true if one existed. */
export function removeOnlineClient(id: string): boolean {
  return onlineClients.delete(id);
}

export function getOnlineClient(id: string): OnlineClient | undefined {
  return onlineClients.get(id);
}

/** Every online passenger, most recently online first (no distance info). */
export function listOnlineClients(): OnlineClient[] {
  return [...onlineClients.values()].sort((a, b) => b.since.localeCompare(a.since));
}

/**
 * Returns every online passenger, each annotated with distance from the given
 * point and sorted nearest-first. Radius filtering is intentionally removed so
 * clients and drivers can always see each other regardless of distance.
 */
export function clientsNear(
  point: { latitude: number; longitude: number },
  _radiusKm?: number
): NearbyClient[] {
  const results: NearbyClient[] = [];
  for (const client of onlineClients.values()) {
    const distanceKm = haversineKm(point, client);
    results.push({ ...client, distanceKm: Math.round(distanceKm * 10) / 10 });
  }
  return results.sort((a, b) => a.distanceKm - b.distanceKm);
}

// ---------------------------------------------------------------------------
// Driver presence (for customer-facing real-time stream)
// ---------------------------------------------------------------------------

/**
 * Records (or refreshes) a driver as online. Returns the stored record plus
 * whether this was their first appearance.
 */
export function upsertOnlineDriver(input: {
  id: string;
  latitude: number;
  longitude: number;
  vehicleType?: string;
  name?: string;
  heading?: number;
}): { driver: OnlineDriver; isNew: boolean } {
  const existing = onlineDrivers.get(input.id);
  const vehicleType = input.vehicleType ?? existing?.vehicleType;
  const name = input.name ?? existing?.name;
  const driver: OnlineDriver = {
    id: input.id,
    latitude: input.latitude,
    longitude: input.longitude,
    ...(vehicleType ? { vehicleType } : {}),
    ...(name ? { name } : {}),
    ...(typeof input.heading === 'number' ? { heading: input.heading } : {}),
    since: existing?.since ?? new Date().toISOString(),
    lastSeenAt: Date.now(),
  };
  onlineDrivers.set(input.id, driver);
  return { driver, isNew: !existing };
}

/** Removes a driver from the online registry. Returns true if one existed. */
export function removeOnlineDriver(id: string): boolean {
  return onlineDrivers.delete(id);
}

export function getOnlineDriver(id: string): OnlineDriver | undefined {
  return onlineDrivers.get(id);
}

/** Every driver with a live, heart-beating app (admin god-view). */
export function listOnlineDrivers(): OnlineDriver[] {
  return [...onlineDrivers.values()];
}

/**
 * Cache of each driver's availability toggle (the DB `isOnline` flag), so a
 * socket heartbeat arriving after the driver tapped "Go offline" can't put
 * them back on the map. `undefined` means "not known yet — ask the DB".
 */
const driverOnlineFlags = new Map<string, boolean>();

export function setDriverOnlineFlag(id: string, online: boolean) {
  driverOnlineFlags.set(id, online);
}

export function getDriverOnlineFlag(id: string): boolean | undefined {
  return driverOnlineFlags.get(id);
}

/** True when the driver has a live, recently-heard-from connection. */
export function isDriverLive(id: string): boolean {
  return onlineDrivers.has(id);
}

/**
 * Drops presence entries that stopped reporting (app killed, network lost, a
 * half-open socket the server never saw close). Returns the removed ids so the
 * socket layer can broadcast them as offline.
 */
export function sweepStalePresence(maxAgeMs: number): {
  clientIds: string[];
  driverIds: string[];
} {
  const cutoff = Date.now() - maxAgeMs;
  const clientIds: string[] = [];
  const driverIds: string[] = [];
  for (const [id, client] of onlineClients) {
    if (client.lastSeenAt < cutoff) {
      onlineClients.delete(id);
      clientIds.push(id);
    }
  }
  for (const [id, driver] of onlineDrivers) {
    if (driver.lastSeenAt < cutoff) {
      onlineDrivers.delete(id);
      driverIds.push(id);
    }
  }
  return { clientIds, driverIds };
}

/**
 * Returns every online driver, each annotated with distance from the given
 * point and sorted nearest-first. No radius filter — nationwide visibility.
 */
export function driversNear(
  point: { latitude: number; longitude: number },
  _radiusKm?: number
): NearbyDriverEntry[] {
  const results: NearbyDriverEntry[] = [];
  for (const driver of onlineDrivers.values()) {
    const distanceKm = haversineKm(point, driver);
    results.push({ ...driver, distanceKm: Math.round(distanceKm * 10) / 10 });
  }
  return results.sort((a, b) => a.distanceKm - b.distanceKm);
}
