import { PayoutStatus, Prisma, UserRole } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { requireAuth, requireRoles } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { badRequest, notFound } from '../../utils/http';
import { ok } from '../../utils/response';
import { WalletTxType } from '../payments/settlement';
import { documentsRouter } from './documents.routes';
import { monitoringRouter } from './monitoring.routes';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRoles(UserRole.ADMIN, UserRole.OPERATIONS, UserRole.SUPPORT));
adminRouter.use(monitoringRouter);
adminRouter.use(documentsRouter);

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

adminRouter.get(
  '/payouts',
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const where =
      status && status in PayoutStatus
        ? { status: status as PayoutStatus }
        : { status: { in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING] } };

    const payouts = await prisma.payout.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { id: true, name: true, phone: true, role: true } } },
    });
    return ok(res, payouts);
  })
);

adminRouter.post(
  '/payouts/:id/mark-paid',
  requireRoles(UserRole.ADMIN, UserRole.OPERATIONS),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id) throw badRequest('Payout id is required');

    const payout = await prisma.payout.findUnique({ where: { id } });
    if (!payout) throw notFound('Payout not found');
    if (payout.status === PayoutStatus.PAID) return ok(res, payout);
    if (payout.status === PayoutStatus.FAILED || payout.status === PayoutStatus.CANCELLED) {
      throw badRequest('Cannot mark a failed or cancelled payout as paid');
    }

    const updated = await prisma.payout.update({
      where: { id },
      data: { status: PayoutStatus.PAID, processedAt: new Date() },
    });
    return ok(res, updated);
  })
);

adminRouter.post(
  '/payouts/:id/mark-failed',
  requireRoles(UserRole.ADMIN, UserRole.OPERATIONS),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id) throw badRequest('Payout id is required');
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'Rejected by admin';

    const payout = await prisma.payout.findUnique({ where: { id } });
    if (!payout) throw notFound('Payout not found');
    if (payout.status === PayoutStatus.PAID) throw badRequest('Cannot fail an already-paid payout');
    if (payout.status === PayoutStatus.FAILED || payout.status === PayoutStatus.CANCELLED) {
      return ok(res, payout);
    }

    // Refund the reserved amount back to the user's wallet.
    const updated = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: payout.userId } });
      if (wallet) {
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: new Prisma.Decimal(payout.amount) } },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: WalletTxType.WITHDRAWAL_REVERSAL,
            amount: new Prisma.Decimal(payout.amount),
            reference: `PAYOUT-${payout.id}-REVERSAL`,
            metadata: { payoutId: payout.id },
          },
        });
      }
      return tx.payout.update({
        where: { id },
        data: { status: PayoutStatus.FAILED, failureReason: reason },
      });
    });

    return ok(res, updated);
  })
);
