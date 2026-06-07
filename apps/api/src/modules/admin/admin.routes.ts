import { UserRole } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { requireAuth, requireRoles } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/response';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRoles(UserRole.ADMIN, UserRole.OPERATIONS, UserRole.SUPPORT));

adminRouter.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    const [users, riders, activeDeliveries, revenue] = await Promise.all([
      prisma.user.count(),
      prisma.riderProfile.count(),
      prisma.delivery.count({
        where: {
          status: { in: ['REQUESTED', 'ASSIGNING', 'ASSIGNED', 'PICKING_UP', 'IN_TRANSIT'] },
        },
      }),
      prisma.payment.aggregate({
        where: { status: 'PAID' },
        _sum: { amount: true },
      }),
    ]);

    return ok(res, {
      users,
      riders,
      activeDeliveries,
      revenueGhs: revenue._sum.amount ?? 0,
    });
  })
);

adminRouter.get(
  '/deliveries/live',
  asyncHandler(async (_req, res) => {
    const deliveries = await prisma.delivery.findMany({
      where: { status: { in: ['REQUESTED', 'ASSIGNING', 'ASSIGNED', 'PICKING_UP', 'IN_TRANSIT'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        assignments: {
          include: { riderProfile: { include: { user: true, vehicle: true } } },
          orderBy: { offeredAt: 'desc' },
          take: 1,
        },
        trackingPoints: {
          orderBy: { capturedAt: 'desc' },
          take: 1,
        },
        suspiciousEvents: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        payment: true,
      },
    });
    return ok(res, deliveries);
  })
);
