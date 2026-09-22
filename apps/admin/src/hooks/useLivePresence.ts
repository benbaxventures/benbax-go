import { useEffect, useMemo, useRef, useState } from 'react';
import { realtimeEvents } from '../lib/realtimeEvents';
import { createRealtimeClient } from '../services/realtime';

/** A driver's live position, as the API's presence registry holds it. */
export type PresenceDriver = {
  id: string;
  latitude: number;
  longitude: number;
  heading?: number;
  name?: string;
  vehicleType?: string;
  since: string;
  lastSeenAt: number;
};

/** A passenger's live position, as the API's presence registry holds it. */
export type PresenceClient = {
  id: string;
  latitude: number;
  longitude: number;
  name?: string;
  serviceClass?: string;
  since: string;
  lastSeenAt: number;
};

export type LivePresence = {
  /** Live drivers by user id. Empty until the first snapshot lands. */
  drivers: Map<string, PresenceDriver>;
  /** Live passengers by user id. */
  clients: Map<string, PresenceClient>;
  /** True while the socket is connected and a snapshot has been received. */
  streaming: boolean;
  /** Whether the socket itself is up, snapshot or not. */
  connected: boolean;
  /** Epoch ms of the last presence event, or null if none yet. */
  lastEventAt: number | null;
};

type Options = {
  /** Whether to connect at all — pass false to stay offline. */
  enabled?: boolean;
  /** Called when a driver/passenger joins or leaves the live set. */
  onPeopleChanged?: () => void;
  /** Called for ride lifecycle events, which this hook only relays. */
  onRideEvent?: () => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Normalizes a presence payload off the wire. Anything without an id and a
 * finite position is dropped rather than drawn at (0, 0) in the Gulf of Guinea.
 */
function toEntry<T extends PresenceDriver | PresenceClient>(payload: unknown): T | null {
  if (!isRecord(payload)) return null;
  const id = typeof payload.id === 'string' ? payload.id : null;
  const latitude = Number(payload.latitude);
  const longitude = Number(payload.longitude);
  if (!id || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    ...payload,
    id,
    latitude,
    longitude,
    since: typeof payload.since === 'string' ? payload.since : new Date().toISOString(),
    lastSeenAt: Number.isFinite(Number(payload.lastSeenAt))
      ? Number(payload.lastSeenAt)
      : Date.now(),
  } as T;
}

function idOf(payload: unknown): string | null {
  if (typeof payload === 'string') return payload;
  if (isRecord(payload) && typeof payload.id === 'string') return payload.id;
  return null;
}

/**
 * Subscribes the dashboard to the API's live presence stream: one snapshot of
 * everyone online on connect, then a delta per movement, arrival and drop-off.
 *
 * The /admin/ops/presence poll stays the source of truth for who someone *is*
 * (name, vehicle, whether they're on a trip). This hook is the source of truth
 * for where they are right now — positions move the moment a phone reports
 * instead of on the next poll. `onPeopleChanged` fires when someone appears or
 * disappears, so the caller can pull the newcomer's details straight away.
 */
export function useLivePresence({
  enabled = true,
  onPeopleChanged,
  onRideEvent,
}: Options = {}): LivePresence {
  const [presence, setPresence] = useState<{
    drivers: Map<string, PresenceDriver>;
    clients: Map<string, PresenceClient>;
    streaming: boolean;
    lastEventAt: number | null;
  }>(() => ({ drivers: new Map(), clients: new Map(), streaming: false, lastEventAt: null }));
  const [connected, setConnected] = useState(false);

  // Held in refs so a changed callback identity never tears the socket down —
  // a reconnect would lose every delta that landed while it was gone.
  const peopleChangedRef = useRef(onPeopleChanged);
  const rideEventRef = useRef(onRideEvent);
  peopleChangedRef.current = onPeopleChanged;
  rideEventRef.current = onRideEvent;

  useEffect(() => {
    if (!enabled) return;

    // Mutable working copies. State gets fresh Maps on each commit so React
    // sees a change; mutating these keeps the socket handlers free of the
    // double-invocation hazards of doing work inside a state updater.
    const drivers = new Map<string, PresenceDriver>();
    const clients = new Map<string, PresenceClient>();

    const commit = (peopleChanged: boolean) => {
      setPresence({
        drivers: new Map(drivers),
        clients: new Map(clients),
        streaming: true,
        lastEventAt: Date.now(),
      });
      if (peopleChanged) peopleChangedRef.current?.();
    };

    // Ask for a fresh snapshot on every (re)connect: deltas that landed while
    // the socket was down are gone, so the local maps must be rebuilt.
    const socket = createRealtimeClient((s) => s.emit('admin:watch'));

    const upsertDriver = (payload: unknown) => {
      const entry = toEntry<PresenceDriver>(payload);
      if (!entry) return;
      const isNew = !drivers.has(entry.id);
      drivers.set(entry.id, entry);
      commit(isNew);
    };

    const upsertClient = (payload: unknown) => {
      const entry = toEntry<PresenceClient>(payload);
      if (!entry) return;
      const isNew = !clients.has(entry.id);
      clients.set(entry.id, entry);
      commit(isNew);
    };

    const dropFrom = (map: Map<string, unknown>, payload: unknown) => {
      const id = idOf(payload);
      if (!id || !map.delete(id)) return;
      commit(true);
    };

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on(realtimeEvents.presenceSnapshot, (payload: unknown) => {
      if (!isRecord(payload)) return;
      drivers.clear();
      clients.clear();
      for (const raw of Array.isArray(payload.drivers) ? payload.drivers : []) {
        const entry = toEntry<PresenceDriver>(raw);
        if (entry) drivers.set(entry.id, entry);
      }
      for (const raw of Array.isArray(payload.clients) ? payload.clients : []) {
        const entry = toEntry<PresenceClient>(raw);
        if (entry) clients.set(entry.id, entry);
      }
      commit(true);
    });

    socket.on(realtimeEvents.driverOnline, upsertDriver);
    socket.on(realtimeEvents.driverMoved, upsertDriver);
    socket.on(realtimeEvents.driverOffline, (p: unknown) => dropFrom(drivers, p));
    socket.on(realtimeEvents.clientOnline, upsertClient);
    socket.on(realtimeEvents.clientMoved, upsertClient);
    socket.on(realtimeEvents.clientOffline, (p: unknown) => dropFrom(clients, p));

    const onRide = () => rideEventRef.current?.();
    socket.on(realtimeEvents.rideRequested, onRide);
    socket.on(realtimeEvents.rideAssigned, onRide);
    socket.on(realtimeEvents.rideUpdated, onRide);
    socket.on(realtimeEvents.driverAvailability, onRide);

    return () => {
      socket.disconnect();
      setConnected(false);
      setPresence({ drivers: new Map(), clients: new Map(), streaming: false, lastEventAt: null });
    };
  }, [enabled]);

  return useMemo(
    () => ({ ...presence, connected, streaming: presence.streaming && connected }),
    [presence, connected]
  );
}
