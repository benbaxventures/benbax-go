import { Prisma } from '@prisma/client';
import jwt from 'jsonwebtoken';
import type { Server, Socket } from 'socket.io';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { notify } from '../modules/notifications/notify';
import { realtimeEvents } from './events';
import {
  clientsNear,
  driversNear,
  getDriverOnlineFlag,
  getOnlineClient,
  getOnlineDriver,
  haversineKm,
  listOnlineClients,
  listOnlineDrivers,
  removeOnlineClient,
  removeOnlineDriver,
  setDriverOnlineFlag,
  sweepStalePresence,
  upsertOnlineClient,
  upsertOnlineDriver,
  type OnlineClient,
  type OnlineDriver,
} from './presence';

/** Presence entries with no report/heartbeat for this long are dropped. */
const PRESENCE_TTL_MS = 90_000;
const PRESENCE_SWEEP_INTERVAL_MS = 30_000;
/** Movement below this (≈15 m) is treated as a heartbeat, not a move event. */
const MOVE_THRESHOLD_KM = 0.015;

/** Live driver positions are persisted for dispatch at most this often. */
const DRIVER_DB_WRITE_INTERVAL_MS = 15_000;

const lastDriverDbWrite = new Map<string, number>();

type SocketAuth = {
  sub: string;
  role: string;
  /** Back-office privilege held alongside `role`; absent for non-staff. */
  staffRole?: string | null;
};

/** The identity a connected socket acts under. */
type SocketUser = { id: string; role: string; staffRole: string | null };

/** Where a driver socket is currently watching for online passengers. */
type DriverWatch = {
  latitude: number;
  longitude: number;
  radiusKm: number;
};

const DEFAULT_WATCH_RADIUS_KM = 200;

/** Shared room every signed-in staff socket joins (the admin god-view). */
const ADMIN_ROOM = 'admins';
const STAFF_ROLES = ['ADMIN', 'OPERATIONS', 'SUPPORT'];

/**
 * Back-office access, from either hat. A driver who is also an operations lead
 * connects one socket that belongs in both the `drivers` room and the admin
 * god-view, so this reads `staffRole` as well as `role`.
 */
function isStaff(user: Pick<SocketUser, 'role' | 'staffRole'>) {
  return (
    STAFF_ROLES.includes(user.role) || (!!user.staffRole && STAFF_ROLES.includes(user.staffRole))
  );
}

/** Everyone online right now, as the admin dashboard's map wants it. */
function presenceSnapshot() {
  return {
    drivers: listOnlineDrivers(),
    clients: listOnlineClients(),
    at: new Date().toISOString(),
  };
}

/** Live driver sockets watching for nearby passengers, keyed by socket id. */
const watchingDrivers = new Map<string, { socket: Socket; watch: DriverWatch }>();

/** Live customer sockets watching for nearby drivers, keyed by socket id. */
const watchingCustomers = new Map<string, { socket: Socket; watch: DriverWatch }>();

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Emits a passenger event to every watching driver regardless of distance, and
 * to the admin god-view. Admins get the raw record: distance is meaningful
 * relative to a driver, not to an operator at a desk.
 */
function broadcastClientToDrivers(io: Server, client: OnlineClient, event: string) {
  for (const { socket, watch } of watchingDrivers.values()) {
    const distanceKm = haversineKm(watch, client);
    socket.emit(event, { ...client, distanceKm: Math.round(distanceKm * 10) / 10 });
  }
  io.to(ADMIN_ROOM).emit(event, client);
}

/** Ride rooms this socket has joined, i.e. the trips it is driving. */
function joinedRideRooms(socket: { rooms: Set<string> }): string[] {
  return [...socket.rooms].filter((room) => room.startsWith('ride:'));
}

/**
 * Pushes a driver's live position to the passengers watching their trips.
 *
 * Emitted to the room rather than back to the sender, so the driver's own app
 * does not echo its GPS to itself. The shape matches the persisted tracking
 * point the passenger already renders, so nothing on the client changes.
 */
function relayDriverPositionToRides(
  socket: {
    rooms: Set<string>;
    broadcast: { to: (room: string) => { emit: (event: string, payload: unknown) => void } };
  },
  io: Server,
  position: { latitude: number; longitude: number; heading?: number }
) {
  for (const room of joinedRideRooms(socket)) {
    const tripId = room.slice('ride:'.length);
    socket.broadcast.to(room).emit(realtimeEvents.rideTrackingPoint, { ...position, tripId });
    io.to(ADMIN_ROOM).emit(realtimeEvents.rideTrackingPoint, { ...position, tripId });
  }
}

/** Pushes a driver's position to watching customers and to the admin god-view. */
function broadcastDriverToWatchers(io: Server, driver: OnlineDriver, event: string) {
  io.to('customer-watchers').emit(event, driver);
  io.to(ADMIN_ROOM).emit(event, driver);
}

/** Tells every watching driver — and the admin god-view — that a passenger is gone. */
function broadcastClientOffline(io: Server, clientId: string) {
  for (const { socket } of watchingDrivers.values()) {
    socket.emit(realtimeEvents.clientOffline, { id: clientId });
  }
  io.to(ADMIN_ROOM).emit(realtimeEvents.clientOffline, { id: clientId });
}

/** Tells every watching customer — and the admin god-view — that a driver is gone. */
function broadcastDriverOffline(io: Server, driverId: string) {
  for (const { socket } of watchingCustomers.values()) {
    socket.emit(realtimeEvents.driverOffline, { id: driverId });
  }
  io.to(ADMIN_ROOM).emit(realtimeEvents.driverOffline, { id: driverId });
}

/**
 * Returns the driver's cached availability + display details, loading them
 * from the DB the first time a socket reports.
 */
async function resolveDriverForReport(
  socket: Socket,
  userId: string
): Promise<{ online: boolean; name?: string; vehicleType?: string } | null> {
  const cached = socket.data.driverProfile as { name?: string; vehicleType?: string } | undefined;
  const flag = getDriverOnlineFlag(userId);
  if (cached && flag !== undefined) return { online: flag, ...cached };

  const row = await prisma.driverProfile.findUnique({
    where: { userId },
    select: {
      isOnline: true,
      vehicle: { select: { type: true } },
      user: { select: { name: true } },
    },
  });
  if (!row) return null;

  const details = {
    ...(row.user.name ? { name: row.user.name } : {}),
    ...(row.vehicle?.type ? { vehicleType: row.vehicle.type } : {}),
  };
  socket.data.driverProfile = details;
  // Don't clobber a toggle that landed while we were reading.
  if (getDriverOnlineFlag(userId) === undefined) setDriverOnlineFlag(userId, row.isOnline);
  return { online: getDriverOnlineFlag(userId) ?? row.isOnline, ...details };
}

export function registerRealtimeHandlers(io: Server) {
  // Drop anyone whose app stopped heart-beating (killed, lost signal, or a
  // half-open socket the server never saw close) so counts stay honest.
  setInterval(() => {
    const { clientIds, driverIds } = sweepStalePresence(PRESENCE_TTL_MS);
    clientIds.forEach((id) => broadcastClientOffline(io, id));
    driverIds.forEach((id) => broadcastDriverOffline(io, id));
  }, PRESENCE_SWEEP_INTERVAL_MS).unref?.();

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token || typeof token !== 'string') return next(new Error('Unauthorized'));

    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as SocketAuth;
      socket.data.user = {
        id: payload.sub,
        role: payload.role,
        staffRole: payload.staffRole ?? null,
      } satisfies SocketUser;
      return next();
    } catch {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as SocketUser;

    socket.join(`user:${user.id}`);
    if (user.role === 'RIDER') socket.join(`rider:${user.id}`);
    if (user.role === 'DRIVER') {
      socket.join(`driver:${user.id}`);
      // Shared room so the API can notify every online driver at once
      // (e.g. when a new passenger registers).
      socket.join('drivers');
    }
    if (isStaff(user)) {
      socket.join(ADMIN_ROOM);
      // Seed the dashboard map immediately; every change after this arrives as
      // a live delta on the same socket.
      socket.emit(realtimeEvents.presenceSnapshot, presenceSnapshot());
    }

    // Every handler below must be registered synchronously. The apps emit
    // `client:watch` / `driver:report` / `ride:join` the instant they connect;
    // awaiting anything first (this used to await a DB write) silently drops
    // those events, leaving a driver deaf to passengers until they moved.
    void prisma.user
      .update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);

    socket
      .to(`user:${user.id}`)
      .emit(realtimeEvents.userPresence, { userId: user.id, online: true });
    io.to('admins').emit(realtimeEvents.userPresence, { userId: user.id, online: true });

    socket.on('delivery:join', (deliveryId: string) => {
      socket.join(`delivery:${deliveryId}`);
    });

    socket.on('delivery:leave', (deliveryId: string) => {
      socket.leave(`delivery:${deliveryId}`);
    });

    socket.on('ride:join', (tripId: string) => {
      socket.join(`ride:${tripId}`);
    });

    socket.on('ride:leave', (tripId: string) => {
      socket.leave(`ride:${tripId}`);
    });

    // ---- Admin god-view ----
    // Re-sync the dashboard after a reconnect or a tab that slept: the deltas
    // it missed while disconnected are gone, so it asks for a fresh snapshot.
    socket.on('admin:watch', () => {
      if (!isStaff(user)) return;
      socket.join(ADMIN_ROOM);
      socket.emit(realtimeEvents.presenceSnapshot, presenceSnapshot());
    });

    // ---- Passenger presence (request app reports where it is) ----
    // The customer app emits this while the passenger is online and looking for
    // a ride. We record it and push the update to every in-range online driver.
    socket.on('client:report', (payload: unknown) => {
      const data = (payload ?? {}) as Record<string, unknown>;
      const latitude = Number(data.latitude);
      const longitude = Number(data.longitude);
      if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return;

      const serviceClass =
        data.serviceClass === 'economy' ||
        data.serviceClass === 'comfort' ||
        data.serviceClass === 'premium'
          ? data.serviceClass
          : undefined;

      const previous = getOnlineClient(user.id);
      const { client, isNew } = upsertOnlineClient({
        id: user.id,
        latitude,
        longitude,
        ...(typeof data.name === 'string' ? { name: data.name } : {}),
        ...(serviceClass ? { serviceClass } : {}),
      });
      socket.data.reportedClient = true;

      // Periodic re-reports double as heartbeats; only real movement is
      // worth fanning out to every driver.
      const moved = !previous || haversineKm(previous, client) >= MOVE_THRESHOLD_KM;
      if (isNew || moved) {
        broadcastClientToDrivers(
          io,
          client,
          isNew ? realtimeEvents.clientOnline : realtimeEvents.clientMoved
        );
      }
    });

    // Passenger closed the booking screen / backgrounded the app.
    socket.on('client:leave', () => {
      socket.data.reportedClient = false;
      if (removeOnlineClient(user.id)) broadcastClientOffline(io, user.id);
    });

    // ---- Driver presence (driver app heartbeats its live position) ----
    // Sent on connect, on movement, and every ~20 s while the driver is online.
    // This is what keeps a driver visible to customers and dispatchable.
    socket.on('driver:report', async (payload: unknown) => {
      if (user.role !== 'DRIVER') return;
      const data = (payload ?? {}) as Record<string, unknown>;
      const latitude = Number(data.latitude);
      const longitude = Number(data.longitude);
      if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return;
      const heading = Number(data.heading);

      try {
        const details = await resolveDriverForReport(socket, user.id);
        if (!details?.online) return;

        const previous = getOnlineDriver(user.id);
        const { driver, isNew } = upsertOnlineDriver({
          id: user.id,
          latitude,
          longitude,
          ...(isFiniteNumber(heading) && heading >= 0 ? { heading } : {}),
          ...(details.name ? { name: details.name } : {}),
          ...(details.vehicleType ? { vehicleType: details.vehicleType } : {}),
        });
        socket.data.reportedDriver = true;

        const moved = !previous || haversineKm(previous, driver) >= MOVE_THRESHOLD_KM;
        if (isNew || moved) {
          broadcastDriverToWatchers(
            io,
            driver,
            isNew ? realtimeEvents.driverOnline : realtimeEvents.driverMoved
          );
        }

        // Passengers waiting on this driver get the same position, live.
        //
        // The persisted trail still arrives over REST, but only every 15s and
        // only while the driver has the trip screen open — too coarse and too
        // fragile to watch a car approach. The driver's app is already in the
        // room for each trip it joined, so relaying here needs no lookup, no
        // database write, and no extra request from either side.
        relayDriverPositionToRides(socket, io, {
          latitude,
          longitude,
          ...(isFiniteNumber(heading) && heading >= 0 ? { heading } : {}),
        });

        // Keep the stored position fresh so dispatch ranks this driver by
        // where they actually are, without a DB write per GPS tick.
        const now = Date.now();
        if (now - (lastDriverDbWrite.get(user.id) ?? 0) >= DRIVER_DB_WRITE_INTERVAL_MS) {
          lastDriverDbWrite.set(user.id, now);
          await prisma.driverProfile.update({
            where: { userId: user.id },
            data: {
              currentLatitude: new Prisma.Decimal(latitude),
              currentLongitude: new Prisma.Decimal(longitude),
              lastLocationAt: new Date(now),
            },
          });
        }
      } catch (error) {
        console.warn('driver:report failed', error);
      }
    });

    // ---- Driver watch (dispatch map subscribes to nearby passengers) ----
    socket.on('client:watch', (payload: unknown) => {
      if (user.role !== 'DRIVER') return;
      const data = (payload ?? {}) as Record<string, unknown>;
      const latitude = Number(data.latitude);
      const longitude = Number(data.longitude);
      if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return;

      const radiusKm = isFiniteNumber(Number(data.radiusKm))
        ? Number(data.radiusKm)
        : DEFAULT_WATCH_RADIUS_KM;

      watchingDrivers.set(socket.id, {
        socket,
        watch: { latitude, longitude, radiusKm },
      });

      // Send an immediate snapshot so the driver's map isn't empty.
      socket.emit(realtimeEvents.clientsNearby, clientsNear({ latitude, longitude }, radiusKm));
    });

    socket.on('client:unwatch', () => {
      watchingDrivers.delete(socket.id);
    });

    // ---- Customer watch (request app subscribes to nearby drivers) ----
    socket.on('driver:watch', (payload: unknown) => {
      if (user.role !== 'CUSTOMER') return;
      const data = (payload ?? {}) as Record<string, unknown>;
      const latitude = Number(data.latitude);
      const longitude = Number(data.longitude);
      if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return;

      const radiusKm = isFiniteNumber(Number(data.radiusKm))
        ? Number(data.radiusKm)
        : DEFAULT_WATCH_RADIUS_KM;

      watchingCustomers.set(socket.id, {
        socket,
        watch: { latitude, longitude, radiusKm },
      });

      // Join a shared room so the REST layer can broadcast driver updates.
      socket.join('customer-watchers');

      // Send an immediate snapshot so the customer's map isn't empty.
      socket.emit(realtimeEvents.driversNearby, driversNear({ latitude, longitude }, radiusKm));
    });

    socket.on('driver:unwatch', () => {
      watchingCustomers.delete(socket.id);
      socket.leave('customer-watchers');
    });

    socket.on('navigation:start', (payload: unknown) => {
      if (user.role !== 'DRIVER' || !payload || typeof payload !== 'object') return;
      const data = payload as Record<string, unknown>;
      const clientId = typeof data.clientId === 'string' ? data.clientId : '';
      if (!clientId) return;
      io.to(`user:${clientId}`).emit('navigation:started', {
        driverId: user.id,
        clientId,
        message: 'A Benbax driver is heading to you',
      });
      // The passenger may not have booked yet, so don't claim "your driver".
      void notify(
        { userIds: [clientId], channels: ['inapp', 'push'] },
        {
          title: 'A Benbax driver is heading to you',
          body: 'Open the app to book the ride and track them live.',
          data: { type: 'driver-approaching', driverId: user.id },
        }
      );
    });

    socket.on('driver:location', (payload: unknown) => {
      if (user.role !== 'DRIVER' || !payload || typeof payload !== 'object') return;
      const data = payload as Record<string, unknown>;
      if (typeof data.clientId !== 'string') return;
      io.to(`user:${data.clientId}`).emit('driver:location', { ...data, driverId: user.id });
    });

    socket.on(realtimeEvents.chatMessage, (payload) => {
      io.to(`delivery:${payload.deliveryId}`).emit(realtimeEvents.chatMessage, {
        ...payload,
        senderId: user.id,
        sentAt: new Date().toISOString(),
      });
    });

    socket.on('disconnect', async () => {
      watchingDrivers.delete(socket.id);
      watchingCustomers.delete(socket.id);
      socket.leave('customer-watchers');

      // Only drop presence once no remaining socket for this user is still
      // reporting it (apps open several sockets, and a user may have more than
      // one device). By the time this fires the current socket has already
      // left its rooms.
      const stillConnected = await io.in(`user:${user.id}`).fetchSockets();
      const noneLeft = stillConnected.length === 0;
      const otherClientReporter = stillConnected.some((s) => s.data.reportedClient);
      const otherDriverReporter = stillConnected.some((s) => s.data.reportedDriver);
      if ((socket.data.reportedClient || noneLeft) && !otherClientReporter) {
        if (removeOnlineClient(user.id)) {
          broadcastClientOffline(io, user.id);
        }
      }
      if ((socket.data.reportedDriver || noneLeft) && !otherDriverReporter) {
        if (removeOnlineDriver(user.id)) {
          broadcastDriverOffline(io, user.id);
        }
      }

      try {
        await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
      } catch {}
      io.to(`user:${user.id}`).emit(realtimeEvents.userPresence, {
        userId: user.id,
        online: false,
      });
      io.to('admins').emit(realtimeEvents.userPresence, { userId: user.id, online: false });
    });
  });
}

/** Internals exposed for unit tests; not part of the module's public surface. */
export const __testing = { joinedRideRooms, relayDriverPositionToRides };
