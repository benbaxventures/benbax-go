import { Router } from 'express';
import { Prisma, UserRole } from '@prisma/client';
import { z } from 'zod';
import { realtimeEvents } from '@benbax/shared';
import { prisma } from '../../config/prisma';
import { requireAuth, requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { notFound } from '../../utils/http';
import { ok } from '../../utils/response';

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
    const rider = await prisma.riderProfile.update({
      where: { userId: req.user!.id },
      data: {
        isOnline: req.body.isOnline,
        status: req.body.isOnline ? 'ACTIVE' : 'OFFLINE',
        currentLatitude: req.body.latitude ? new Prisma.Decimal(req.body.latitude) : undefined,
        currentLongitude: req.body.longitude ? new Prisma.Decimal(req.body.longitude) : undefined,
        lastLocationAt: req.body.latitude && req.body.longitude ? new Date() : undefined
      }
    });

    req.app.get('io')?.to('admins').emit(realtimeEvents.riderAvailability, rider);
    return ok(res, rider);
  })
);

ridersRouter.post(
  '/me/kyc',
  requireRoles(UserRole.RIDER),
  validate(kycSchema),
  asyncHandler(async (req, res) => {
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
        vehicle: req.body.vehicleType
          ? {
              upsert: {
                create: {
                  type: req.body.vehicleType,
                  plateNumber: req.body.plateNumber
                },
                update: {
                  type: req.body.vehicleType,
                  plateNumber: req.body.plateNumber
                }
              }
            }
          : undefined
      },
      include: { kycDocuments: true, vehicle: true }
    });
    return ok(res, rider);
  })
);
