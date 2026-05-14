import { Router } from 'express';
import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { requireAuth, requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { notFound } from '../../utils/http';
import { ok } from '../../utils/response';
import { realtimeEvents } from '../../realtime/events';
import { evaluateTrackingSafety } from './routeSafety';
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
    const deliveryId = req.params.deliveryId;
    if (!deliveryId) throw notFound('Delivery not found');
    const delivery = await prisma.delivery.findFirst({
      where: {
        id: deliveryId,
        assignments: { some: { riderProfileId: rider.id } }
      }
    });
    if (!delivery) throw notFound('Delivery not found');

    const point = await prisma.deliveryTrackingPoint.create({
      data: {
        deliveryId,
        riderProfileId: rider.id,
        latitude: new Prisma.Decimal(req.body.latitude),
        longitude: new Prisma.Decimal(req.body.longitude),
        ...(typeof req.body.heading === 'number' ? { heading: new Prisma.Decimal(req.body.heading) } : {}),
        ...(typeof req.body.speedKph === 'number' ? { speedKph: new Prisma.Decimal(req.body.speedKph) } : {}),
        ...(typeof req.body.batteryLevel === 'number' ? { batteryLevel: req.body.batteryLevel } : {}),
        source: req.body.source ?? 'GPS'
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

    req.app.get('io')?.to(`delivery:${deliveryId}`).emit(realtimeEvents.trackingPoint, point);
    req.app.get('io')?.to('admins').emit(realtimeEvents.trackingPoint, { ...point, deliveryId });
    await evaluateTrackingSafety({
      delivery,
      rider,
      point,
      io: req.app.get('io')
    });
    return ok(res, point);
  })
);

trackingRouter.get(
  '/deliveries/:deliveryId/points',
  asyncHandler(async (req, res) => {
    const deliveryId = req.params.deliveryId;
    if (!deliveryId) throw notFound('Delivery not found');

    const points = await prisma.deliveryTrackingPoint.findMany({
      where: { deliveryId },
      orderBy: { capturedAt: 'desc' },
      take: 100
    });
    return ok(res, points.reverse());
  })
);
