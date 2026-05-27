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

export const ridersRouter = Router();

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
    plateNumber: z.string().optional()
  })
});

ridersRouter.use(requireAuth);

ridersRouter.get(
  '/me',
  requireRoles(UserRole.RIDER),
  asyncHandler(async (req, res) => {
    const rider = await prisma.riderProfile.findUnique({
      where: { userId: req.user!.id },
      include: { user: true, vehicle: true, kycDocuments: true }
    });
    if (!rider) throw notFound('Rider profile not found');
    return ok(res, rider);
  })
);

ridersRouter.patch(
  '/me/availability',
  requireRoles(UserRole.RIDER),
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

    const rider = await prisma.riderProfile.update({
      where: { userId: req.user!.id },
      data: {
        isOnline: req.body.isOnline,
        status: req.body.isOnline ? 'ACTIVE' : 'OFFLINE',
        ...locationUpdate
      }
    });

    const io = req.app.get('io');
    io?.to(`rider:${rider.userId}`).emit(realtimeEvents.riderAvailability, rider);
    io?.to('admins').emit(realtimeEvents.riderAvailability, rider);
    return ok(res, rider);
  })
);

ridersRouter.post(
  '/me/kyc',
  requireRoles(UserRole.RIDER),
  validate(kycSchema),
  asyncHandler(async (req, res) => {
    const vehicleUpdate = req.body.vehicleType
      ? {
          vehicle: {
            upsert: {
              create: {
                type: req.body.vehicleType,
                plateNumber: req.body.plateNumber ?? null
              },
              update: {
                type: req.body.vehicleType,
                plateNumber: req.body.plateNumber ?? null
              }
            }
          }
        }
      : {};

    const rider = await prisma.riderProfile.update({
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
    return ok(res, rider);
  })
);
