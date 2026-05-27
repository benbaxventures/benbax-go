import { Router } from 'express';
import { Prisma, UserRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { requireAuth, requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { notFound } from '../../utils/http';
import { ok } from '../../utils/response';
import { realtimeEvents } from '../../realtime/events';

export const driversRouter = Router();

const availabilitySchema = z.object({
  body: z.object({
    isOnline: z.boolean(),
    latitude: z.number().optional(),
    longitude: z.number().optional()
  })
});

const kycSchema = z.object({
  body: z.object({
    documentType: z.string().min(2),
    fileUrl: z.string().url(),
    vehicleType: z.string().optional(),
    plateNumber: z.string().optional(),
    color: z.string().optional(),
    make: z.string().optional(),
    model: z.string().optional()
  })
});

driversRouter.use(requireAuth);

driversRouter.get(
  '/me',
  requireRoles(UserRole.DRIVER),
  asyncHandler(async (req, res) => {
    const driver = await prisma.driverProfile.findUnique({
      where: { userId: req.user!.id },
      include: { user: true, vehicle: true, kycDocuments: true }
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
            lastLocationAt: new Date()
          }
        : {};

    const driver = await prisma.driverProfile.update({
      where: { userId: req.user!.id },
      data: {
        isOnline: req.body.isOnline,
        status: req.body.isOnline ? 'ACTIVE' : 'OFFLINE',
        ...locationUpdate
      }
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
                model: req.body.model ?? null
              },
              update: {
                type: req.body.vehicleType,
                plateNumber: req.body.plateNumber ?? null,
                color: req.body.color ?? null,
                make: req.body.make ?? null,
                model: req.body.model ?? null
              }
            }
          }
        }
      : {};

    const driver = await prisma.driverProfile.update({
      where: { userId: req.user!.id },
      data: {
        kycStatus: 'SUBMITTED',
        kycDocuments: {
          create: {
            type: req.body.documentType,
            fileUrl: req.body.fileUrl
          }
        },
        ...vehicleUpdate
      },
      include: { kycDocuments: true, vehicle: true }
    });
    return ok(res, driver);
  })
);
