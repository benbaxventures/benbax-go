import { Prisma, UserRole } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { requireAuth, requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { realtimeEvents } from '../../realtime/events';
import {
  clientsNear,
  driversNear,
  getOnlineDriver,
  listOnlineClients,
  removeOnlineDriver,
  setDriverOnlineFlag,
  upsertOnlineDriver,
  type OnlineClient,
} from '../../realtime/presence';
import { asyncHandler } from '../../utils/asyncHandler';
import { notFound } from '../../utils/http';
import { ok } from '../../utils/response';
import { dispatchRide } from '../dispatch/dispatch.service';
import { commissionRate } from '../payments/settlement';
import { listOpenRideRequests } from '../ride-dispatch/ride-marketplace';

export const driversRouter = Router();

function startOfDay(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfWeek(now: Date) {
  const day = now.getDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // days since Monday
  const monday = startOfDay(now);
  monday.setDate(monday.getDate() - diff);
  return monday;
}

function startOfMonth(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

const availabilitySchema = z.object({
  body: z.object({
    isOnline: z.boolean(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  }),
});

const kycSchema = z.object({
  body: z.object({
    documentType: z.string().min(2),
    fileUrl: z.string().url(),
    vehicleType: z.string().optional(),
    plateNumber: z.string().optional(),
    color: z.string().optional(),
    make: z.string().optional(),
    model: z.string().optional(),
  }),
});

const nearbyDriversSchema = z.object({
  query: z.object({
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
    radiusKm: z.coerce.number().min(1).max(200).default(200),
  }),
});

driversRouter.use(requireAuth);

driversRouter.get(
  '/nearby',
  requireRoles(
    UserRole.CUSTOMER,
    UserRole.RIDER,
    UserRole.DRIVER,
    UserRole.ADMIN,
    UserRole.OPERATIONS
  ),
  validate(nearbyDriversSchema),
  asyncHandler(async (req, res) => {
    const latitude = Number(req.query.latitude);
    const longitude = Number(req.query.longitude);

    // Served from the same live presence registry as the Socket.IO stream, so
    // the REST fallback and the realtime feed always agree: only drivers with
    // a connected, heart-beating app are counted (never stale DB `isOnline`
    // rows), ids are user ids on both paths, and there is no distance cut-off.
    const nearby = driversNear({ latitude, longitude }).map((driver) => ({
      id: driver.id,
      latitude: driver.latitude,
      longitude: driver.longitude,
      distanceKm: driver.distanceKm,
      vehicleType: driver.vehicleType ?? null,
      ...(driver.name ? { name: driver.name } : {}),
    }));

    return ok(res, nearby);
  })
);

driversRouter.get(
  '/me',
  requireRoles(UserRole.DRIVER),
  asyncHandler(async (req, res) => {
    const driver = await prisma.driverProfile.findUnique({
      where: { userId: req.user!.id },
      include: { user: true, vehicle: true, kycDocuments: true },
    });
    if (!driver) throw notFound('Driver profile not found');
    return ok(res, driver);
  })
);

driversRouter.patch(
  '/me/availability',
  requireRoles(UserRole.DRIVER),
  validate(availabilitySchema),
  asyncHandler(async (req, res) => {
    const locationUpdate =
      typeof req.body.latitude === 'number' && typeof req.body.longitude === 'number'
        ? {
            currentLatitude: new Prisma.Decimal(req.body.latitude),
            currentLongitude: new Prisma.Decimal(req.body.longitude),
            lastLocationAt: new Date(),
          }
        : {};

    const current = await prisma.driverProfile.findUnique({
      where: { userId: req.user!.id },
      select: { status: true },
    });
    if (!current) throw notFound('Driver profile not found');

    // A driver mid-trip stays ON_TRIP; going online must not make them look
    // free for another dispatch.
    const nextStatus = req.body.isOnline
      ? current.status === 'ON_TRIP'
        ? 'ON_TRIP'
        : 'ACTIVE'
      : 'OFFLINE';

    const driver = await prisma.driverProfile.update({
      where: { userId: req.user!.id },
      data: {
        isOnline: req.body.isOnline,
        status: nextStatus,
        ...locationUpdate,
      },
      include: { vehicle: true, user: { select: { name: true } } },
    });
    setDriverOnlineFlag(driver.userId, req.body.isOnline);

    const { user: driverUser, ...driverPayload } = driver;
    const io = req.app.get('io');
    io?.to(`driver:${driver.userId}`).emit(realtimeEvents.driverAvailability, driverPayload);
    io?.to('admins').emit(realtimeEvents.driverAvailability, driverPayload);

    // Update the in-memory driver presence so customers see this driver in
    // real-time via the Socket.IO stream.
    if (
      req.body.isOnline &&
      typeof req.body.latitude === 'number' &&
      typeof req.body.longitude === 'number'
    ) {
      const vehicleType = driver.vehicle?.type ?? undefined;
      const { driver: onlineDriver, isNew } = upsertOnlineDriver({
        id: driver.userId,
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        ...(vehicleType ? { vehicleType } : {}),
        ...(driverUser.name ? { name: driverUser.name } : {}),
      });
      // Broadcast to all watching customers via the shared room.
      io?.to('customer-watchers').emit(
        isNew ? realtimeEvents.driverOnline : realtimeEvents.driverMoved,
        onlineDriver
      );
    } else if (!req.body.isOnline) {
      if (removeOnlineDriver(driver.userId)) {
        io?.to('customer-watchers').emit(realtimeEvents.driverOffline, { id: driver.userId });
      }

      // Hand any offer this driver was holding to the next driver right away
      // instead of making the passenger wait for it to time out.
      const pending = await prisma.rideAssignment.findMany({
        where: { driverProfileId: driver.id, status: 'OFFERED' },
        select: { id: true, tripId: true },
      });
      if (pending.length) {
        await prisma.rideAssignment.updateMany({
          where: { id: { in: pending.map((p) => p.id) }, status: 'OFFERED' },
          data: { status: 'EXPIRED', respondedAt: new Date() },
        });
        for (const offer of pending) void dispatchRide(offer.tripId, io);
      }
    }

    return ok(res, driverPayload);
  })
);

driversRouter.post(
  '/me/kyc',
  requireRoles(UserRole.DRIVER),
  validate(kycSchema),
  asyncHandler(async (req, res) => {
    const vehicleUpdate = req.body.vehicleType
      ? {
          vehicle: {
            upsert: {
              create: {
                type: req.body.vehicleType,
                plateNumber: req.body.plateNumber ?? null,
                color: req.body.color ?? null,
                make: req.body.make ?? null,
                model: req.body.model ?? null,
              },
              update: {
                type: req.body.vehicleType,
                plateNumber: req.body.plateNumber ?? null,
                color: req.body.color ?? null,
                make: req.body.make ?? null,
                model: req.body.model ?? null,
              },
            },
          },
        }
      : {};

    const driver = await prisma.driverProfile.update({
      where: { userId: req.user!.id },
      data: {
        kycStatus: 'SUBMITTED',
        kycDocuments: {
          create: {
            type: req.body.documentType,
            fileUrl: req.body.fileUrl,
          },
        },
        ...vehicleUpdate,
      },
      include: { kycDocuments: true, vehicle: true },
    });
    return ok(res, driver);
  })
);

driversRouter.get(
  '/me/earnings',
  requireRoles(UserRole.DRIVER),
  asyncHandler(async (req, res) => {
    const driver = await prisma.driverProfile.findUnique({
      where: { userId: req.user!.id },
      select: { id: true, rating: true, totalTrips: true },
    });
    if (!driver) throw notFound('Driver profile not found');

    const rate = commissionRate();

    // Completed trips this driver was assigned to, with fare + completion time.
    const completed = await prisma.rideAssignment.findMany({
      where: { driverProfileId: driver.id, status: 'ACCEPTED', trip: { status: 'COMPLETED' } },
      select: { trip: { select: { totalFare: true, updatedAt: true } } },
    });

    const now = new Date();
    const dayStart = startOfDay(now);
    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);

    const empty = () => ({ amount: 0, tripCount: 0 });
    const today = empty();
    const thisWeek = empty();
    const thisMonth = empty();

    for (const { trip } of completed) {
      const net = Number(trip.totalFare) * (1 - rate);
      const at = trip.updatedAt;
      if (at >= dayStart) {
        today.amount += net;
        today.tripCount += 1;
      }
      if (at >= weekStart) {
        thisWeek.amount += net;
        thisWeek.tripCount += 1;
      }
      if (at >= monthStart) {
        thisMonth.amount += net;
        thisMonth.tripCount += 1;
      }
    }

    const round = (value: number) => Math.round(value * 100) / 100;

    const [acceptedCount, rejectedCount] = await Promise.all([
      prisma.rideAssignment.count({ where: { driverProfileId: driver.id, status: 'ACCEPTED' } }),
      prisma.rideAssignment.count({ where: { driverProfileId: driver.id, status: 'REJECTED' } }),
    ]);

    const respondedCount = acceptedCount + rejectedCount;
    const acceptanceRate =
      respondedCount > 0 ? Math.round((acceptedCount / respondedCount) * 100) : null;
    const completionRate =
      acceptedCount > 0 ? Math.round((completed.length / acceptedCount) * 100) : null;

    return ok(res, {
      today: { amount: round(today.amount), tripCount: today.tripCount },
      thisWeek: { amount: round(thisWeek.amount), tripCount: thisWeek.tripCount },
      thisMonth: { amount: round(thisMonth.amount), tripCount: thisMonth.tripCount },
      totalTrips: driver.totalTrips,
      averageRating: driver.rating != null ? Number(driver.rating) : null,
      acceptanceRate,
      completionRate,
    });
  })
);

driversRouter.get(
  '/me/nearby-clients',
  requireRoles(UserRole.DRIVER),
  asyncHandler(async (req, res) => {
    const driver = await prisma.driverProfile.findUnique({
      where: { userId: req.user!.id },
      select: { currentLatitude: true, currentLongitude: true },
    });
    if (!driver) throw notFound('Driver profile not found');

    // Prefer the live socket position; fall back to the last stored one. With
    // neither, still list everyone online (nationwide) — just without distances.
    const presence = getOnlineDriver(req.user!.id);
    const from = presence
      ? { latitude: presence.latitude, longitude: presence.longitude }
      : driver.currentLatitude != null && driver.currentLongitude != null
        ? { latitude: Number(driver.currentLatitude), longitude: Number(driver.currentLongitude) }
        : null;

    const clients: OnlineClient[] = from ? clientsNear(from) : listOnlineClients();

    // Attach each passenger's waiting ride request, if they have one, so the
    // driver can see pickup/dropoff/fare and accept straight from the client.
    const openRequests = await listOpenRideRequests(from);
    const requestByPassenger = new Map(openRequests.map((r) => [r.passengerId, r]));

    return ok(
      res,
      clients.map((client) => {
        const openRequest = requestByPassenger.get(client.id);
        return openRequest ? { ...client, openRequest } : client;
      })
    );
  })
);

driversRouter.get(
  '/me/news',
  requireRoles(UserRole.DRIVER),
  asyncHandler(async (req, res) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return ok(
      res,
      notifications.map((item) => {
        const data = item.data && typeof item.data === 'object' ? item.data : null;
        const type = data && 'type' in data ? data.type : null;
        return {
          id: item.id,
          title: item.title,
          body: item.body,
          createdAt: item.createdAt,
          type: type === 'warning' || type === 'update' || type === 'promotion' ? type : 'info',
        };
      })
    );
  })
);

driversRouter.get(
  '/me/bonuses',
  requireRoles(UserRole.DRIVER),
  asyncHandler(async (req, res) => {
    // No active bonus programme yet; return an empty list the client renders around.
    const driver = await prisma.driverProfile.findUnique({
      where: { userId: req.user!.id },
      select: { id: true },
    });
    if (!driver) throw notFound('Driver profile not found');
    return ok(res, []);
  })
);
