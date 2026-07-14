import jwt from 'jsonwebtoken';
import type { Server, Socket } from 'socket.io';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { realtimeEvents } from './events';
import {
  clientsNear,
  haversineKm,
  removeOnlineClient,
  upsertOnlineClient,
  type OnlineClient,
} from './presence';

type SocketAuth = {
  sub: string;
  role: string;
};

/** Where a driver socket is currently watching for online passengers. */
type DriverWatch = {
  latitude: number;
  longitude: number;
  radiusKm: number;
};

const DEFAULT_WATCH_RADIUS_KM = 10;

/** Live driver sockets watching for nearby passengers, keyed by socket id. */
const watchingDrivers = new Map<string, { socket: Socket; watch: DriverWatch }>();

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Emits a passenger event to every watching driver within their own radius. */
function broadcastClientToDrivers(client: OnlineClient, event: string) {
  for (const { socket, watch } of watchingDrivers.values()) {
    const distanceKm = haversineKm(watch, client);
    if (distanceKm <= watch.radiusKm) {
      socket.emit(event, { ...client, distanceKm: Math.round(distanceKm * 10) / 10 });
    }
  }
}

/** Tells every watching driver that a passenger is no longer available. */
function broadcastClientOffline(clientId: string) {
  for (const { socket } of watchingDrivers.values()) {
    socket.emit(realtimeEvents.clientOffline, { id: clientId });
  }
}

export function registerRealtimeHandlers(io: Server) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token || typeof token !== 'string') return next(new Error('Unauthorized'));

    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as SocketAuth;
      socket.data.user = { id: payload.sub, role: payload.role };
      return next();
    } catch {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const user = socket.data.user as { id: string; role: string };

    socket.join(`user:${user.id}`);
    if (user.role === 'RIDER') socket.join(`rider:${user.id}`);
    if (user.role === 'DRIVER') {
      socket.join(`driver:${user.id}`);
      // Shared room so the API can notify every online driver at once
      // (e.g. when a new passenger registers).
      socket.join('drivers');
    }
    if (['ADMIN', 'OPERATIONS', 'SUPPORT'].includes(user.role)) socket.join('admins');

    try {
      await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
    } catch {}

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

      const { client, isNew } = upsertOnlineClient({
        id: user.id,
        latitude,
        longitude,
        ...(typeof data.name === 'string' ? { name: data.name } : {}),
        ...(serviceClass ? { serviceClass } : {}),
      });

      broadcastClientToDrivers(
        client,
        isNew ? realtimeEvents.clientOnline : realtimeEvents.clientMoved
      );
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

    socket.on(realtimeEvents.chatMessage, (payload) => {
      io.to(`delivery:${payload.deliveryId}`).emit(realtimeEvents.chatMessage, {
        ...payload,
        senderId: user.id,
        sentAt: new Date().toISOString(),
      });
    });

    socket.on('disconnect', async () => {
      watchingDrivers.delete(socket.id);

      // Only drop the passenger from the online registry once their last socket
      // is gone (a user may have more than one device/tab connected). By the time
      // this fires the current socket has already left its rooms.
      const stillConnected = await io.in(`user:${user.id}`).fetchSockets();
      if (stillConnected.length === 0 && removeOnlineClient(user.id)) {
        broadcastClientOffline(user.id);
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
