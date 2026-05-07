import { Router } from 'express';
import { Prisma, UserRole } from '@prisma/client';
import { realtimeEvents } from '@benbax/shared';
import { prisma } from '../../config/prisma';
import { requireAuth, requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { notFound } from '../../utils/http';
import { ok } from '../../utils/response';
import { z } from 'zod';

export const trackingRouter = Router();

const pointSchema = z.object({
  params: z.object({ deliveryId: z.string().min(1) }),
  body: z.object({
    latitude: z.number(),
    longitude: z.number(),
    heading: z.number().optional(),
    speedKph: z.number().optional(),
    batteryLevel: z.number().int().min(0).max(100).optional(),
    source: z.string().default('GPS')
  })
});

trackingRouter.use(requireAuth);

trackingRouter.post(
  '/deliveries/:deliveryId/points',
  requireRoles(UserRole.RIDER),
  validate(pointSchema),
  asyncHandler(async (req, res) => {
    const rider = await prisma.riderProfile.findUnique({ where: { userId: req.user!.id } });
    if (!rider) throw notFound('Rider profile not found');

    const point = await prisma.deliveryTrackingPoint.create({
      data: {
        deliveryId: req.params.deliveryId,
        riderProfileId: rider.id,
        latitude: new Prisma.Decimal(req.body.latitude),
        longitude: new Prisma.Decimal(req.body.longitude),
        heading: req.body.heading ? new Prisma.Decimal(req.body.heading) : undefined,
        speedKph: req.body.speedKph ? new Prisma.Decimal(req.body.speedKph) : undefined,
        batteryLevel: req.body.batteryLevel,
        source: req.body.source
      }
    });

    await prisma.riderProfile.update({
      where: { id: rider.id },
      data: {
        currentLatitude: point.latitude,
        currentLongitude: point.longitude,
        lastLocationAt: new Date()
      }
    });

    req.app.get('io')?.to(`delivery:${req.params.deliveryId}`).emit(realtimeEvents.trackingPoint, point);
    return ok(res, point);
  })
);

trackingRouter.get(
  '/deliveries/:deliveryId/points',
  asyncHandler(async (req, res) => {
    const points = await prisma.deliveryTrackingPoint.findMany({
      where: { deliveryId: req.params.deliveryId },
      orderBy: { capturedAt: 'desc' },
      take: 100
    });
    return ok(res, points.reverse());
  })
);
