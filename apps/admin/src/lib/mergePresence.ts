import type { PresenceClient, PresenceDriver } from '../hooks/useLivePresence';
import type { LiveDriver, LivePassenger } from './opsTypes';

/**
 * Combines the two things the dashboard knows about who is online.
 *
 * `/admin/ops/presence` (polled) carries identity — name, phone, vehicle,
 * whether the driver is mid-trip — but is up to a poll interval stale. The
 * socket stream carries position and membership the instant they change.
 *
 * So the socket decides *who* is on the map and *where* they are; the REST row
 * fills in everything else. Someone who appears between polls is drawn from
 * their presence record alone, with the identity fields left honestly blank
 * until the next poll enriches them.
 *
 * When the socket is down (`streaming: false`) the REST rows are returned
 * untouched — a stale map beats an empty one.
 */
export function mergeLiveDrivers(
  rows: LiveDriver[],
  live: Map<string, PresenceDriver>,
  streaming: boolean
): LiveDriver[] {
  if (!streaming) return rows;
  const byId = new Map(rows.map((row) => [row.userId, row]));

  return [...live.values()].map((entry) => {
    const row = byId.get(entry.id);
    const position = {
      latitude: entry.latitude,
      longitude: entry.longitude,
      heading: entry.heading ?? null,
      onlineSince: entry.since,
      lastSeenAt: new Date(entry.lastSeenAt).toISOString(),
    };
    if (row) return { ...row, ...position };

    return {
      userId: entry.id,
      driverProfileId: null,
      name: entry.name ?? 'Driver',
      phone: null,
      status: 'ACTIVE',
      busy: false,
      activeTripId: null,
      rating: null,
      kycStatus: null,
      vehicle: entry.vehicleType
        ? { type: entry.vehicleType, plateNumber: null, color: null, make: null }
        : null,
      ...position,
    } satisfies LiveDriver;
  });
}

/** The passenger half of {@link mergeLiveDrivers}. */
export function mergeLivePassengers(
  rows: LivePassenger[],
  live: Map<string, PresenceClient>,
  streaming: boolean
): LivePassenger[] {
  if (!streaming) return rows;
  const byId = new Map(rows.map((row) => [row.userId, row]));

  return [...live.values()].map((entry) => {
    const row = byId.get(entry.id);
    const position = {
      latitude: entry.latitude,
      longitude: entry.longitude,
      onlineSince: entry.since,
      lastSeenAt: new Date(entry.lastSeenAt).toISOString(),
    };
    if (row) return { ...row, ...position };

    return {
      userId: entry.id,
      name: entry.name ?? 'Passenger',
      phone: null,
      tripId: null,
      tripStatus: null,
      ...position,
    } satisfies LivePassenger;
  });
}
