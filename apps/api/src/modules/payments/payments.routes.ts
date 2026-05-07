import { Router } from 'express';
import { PaymentMethod } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { notFound } from '../../utils/http';
import { ok } from '../../utils/response';

export const paymentsRouter = Router();

const initializeSchema = z.object({
  body: z.object({
    deliveryId: z.string(),
    method: z.nativeEnum(PaymentMethod),
    mobileNumber: z.string().optional()
  })
});

paymentsRouter.use(requireAuth);

paymentsRouter.post(
  '/initialize',
  validate(initializeSchema),
  asyncHandler(async (req, res) => {
    const delivery = await prisma.delivery.findFirst({
      where: { id: req.body.deliveryId, customerId: req.user!.id },
      include: { payment: true }
    });
    if (!delivery) throw notFound('Delivery not found');

    const payment = await prisma.payment.upsert({
      where: { deliveryId: delivery.id },
      create: {
        deliveryId: delivery.id,
        method: req.body.method,
        mobileNumber: req.body.mobileNumber,
        amount: delivery.totalFare,
        currency: 'GHS',
        provider: req.body.method === 'MTN_MOMO' ? 'MTN_MOMO' : req.body.method === 'PAYSTACK_CARD' ? 'PAYSTACK' : null,
        providerRef: `BBX-PAY-${delivery.trackingCode}`
      },
      update: {
        method: req.body.method,
        mobileNumber: req.body.mobileNumber
      }
    });

    return ok(res, {
      payment,
      nextAction:
        req.body.method === 'CASH_ON_DELIVERY'
          ? 'COLLECT_ON_DELIVERY'
          : req.body.method === 'MTN_MOMO'
            ? 'AUTHORIZE_MOBILE_MONEY_PROMPT'
            : 'OPEN_PROVIDER_CHECKOUT'
    });
  })
);
