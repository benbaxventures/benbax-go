import { Prisma, UserRole } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { requireAuth, requireRoles } from '../../middleware/auth';
import { realtimeEvents } from '../../realtime/events';
import { asyncHandler } from '../../utils/asyncHandler';
import { badRequest, notFound } from '../../utils/http';
import { ok } from '../../utils/response';
import { rankRiders } from './dispatch.engine';

export const dispatchRouter = Router();

dispatchRouter.use(requireAuth);

dispatchRouter.post(
  '/deliveries/:id/assign',
  requireRoles(UserRole.ADMIN, UserRole.OPERATIONS),
  asyncHandler(async (req, res) => {
    const deliveryId = req.params.id;
    if (!deliveryId) throw badRequest('Delivery id is required');

    const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) throw notFound('Delivery not found');

    const riders = await prisma.riderProfile.findMany({
      where: {
        isOnline: true,
        status: 'ACTIVE',
        currentLatitude: { not: null },
        currentLongitude: { not: null },
      },
      take: 25,
    });

    if (!riders.length) throw badRequest('No available riders near pickup');

    const ranked = rankRiders(
      {
        latitude: Number(delivery.pickupLatitude),
        longitude: Number(delivery.pickupLongitude),
      },
      riders.map((rider) => ({
        id: rider.id,
        latitude: Number(rider.currentLatitude),
        longitude: Number(rider.currentLongitude),
        rating: Number(rider.rating),
        activeDeliveries: rider.status === 'ON_DELIVERY' ? 1 : 0,
        lastLocationAgeSeconds: rider.lastLocationAt
          ? Math.floor((Date.now() - rider.lastLocationAt.getTime()) / 1000)
          : 300,
      }))
    );

    const best = ranked[0];
    if (!best) throw badRequest('No dispatch candidates could be ranked');

    const assignment = await prisma.deliveryAssignment.create({
      data: {
        deliveryId: delivery.id,
        riderProfileId: best.riderId,
        score: new Prisma.Decimal(best.score),
        expiresAt: new Date(Date.now() + 45_000),
      },
      include: {
        riderProfile: { include: { user: true } },
        delivery: true,
      },
    });

    await prisma.delivery.update({
      where: { id: delivery.id },
      data: { status: 'ASSIGNING' },
    });

    req.app
      .get('io')
      ?.to(`rider:${assignment.riderProfile.userId}`)
      .emit(realtimeEvents.riderOffer, assignment);
    req.app.get('io')?.to('admins').emit(realtimeEvents.deliveryAssigned, assignment);

    return ok(res, { assignment, ranked });
  })
);

dispatchRouter.post(
  '/assignments/:id/accept',
  requireRoles(UserRole.RIDER),
  asyncHandler(async (req, res) => {
    const rider = await prisma.riderProfile.findUnique({ where: { userId: req.user!.id } });
    if (!rider) throw notFound('Rider profile not found');
    const assignmentId = req.params.id;
    if (!assignmentId) throw badRequest('Assignment id is required');

    const assignment = await prisma.deliveryAssignment.update({
      where: { id: assignmentId },
      data: {
        status: 'ACCEPTED',
        respondedAt: new Date(),
        delivery: { update: { status: 'ASSIGNED' } },
        riderProfile: { update: { status: 'ON_DELIVERY' } },
      },
      include: { delivery: true },
    });

    req.app
      .get('io')
      ?.to(`delivery:${assignment.deliveryId}`)
      .emit(realtimeEvents.deliveryAssigned, assignment);
    return ok(res, assignment);
  })
);

dispatchRouter.post(
  '/assignments/:id/reject',
  requireRoles(UserRole.RIDER),
  asyncHandler(async (req, res) => {
    const assignmentId = req.params.id;
    if (!assignmentId) throw badRequest('Assignment id is required');

    const assignment = await prisma.deliveryAssignment.update({
      where: { id: assignmentId },
      data: { status: 'REJECTED', respondedAt: new Date() },
    });
    return ok(res, assignment);
  })
);
