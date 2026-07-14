import { Prisma, UserRole } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { requireAuth, requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { realtimeEvents } from '../../realtime/events';
import { clientsNear } from '../../realtime/presence';
import { asyncHandler } from '../../utils/asyncHandler';
import { notFound } from '../../utils/http';
import { ok } from '../../utils/response';
import { commissionRate } from '../payments/settlement';

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

driversRouter.use(requireAuth);

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

    const driver = await prisma.driverProfile.update({
      where: { userId: req.user!.id },
      data: {
        isOnline: req.body.isOnline,
        status: req.body.isOnline ? 'ACTIVE' : 'OFFLINE',
        ...locationUpdate,
      },
    });

    const io = req.app.get('io');
    io?.to(`driver:${driver.userId}`).emit(realtimeEvents.driverAvailability, driver);
    io?.to('admins').emit(realtimeEvents.driverAvailability, driver);
    return ok(res, driver);
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

    // Without a known location we can't scope by distance; return an empty
    // snapshot and let the live socket stream fill in as the driver moves.
    if (driver.currentLatitude == null || driver.currentLongitude == null) {
      return ok(res, []);
    }

    const radiusKm = Number(req.query.radiusKm) || 10;
    const nearby = clientsNear(
      {
        latitude: Number(driver.currentLatitude),
        longitude: Number(driver.currentLongitude),
      },
      radiusKm
    );
    return ok(res, nearby);
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
