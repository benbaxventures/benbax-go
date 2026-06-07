import { DeliveryCategory, DeliveryStatus, UserRole } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { created, ok } from '../../utils/response';
import { dispatchDelivery } from '../dispatch/dispatch.service';
import * as service from './deliveries.service';

export const deliveriesRouter = Router();

const addressSchema = z.object({
  label: z.string().min(2),
  address: z.string().optional(),
  latitude: z.number(),
  longitude: z.number(),
  landmark: z.string().optional(),
  voiceNoteUrl: z.string().url().optional(),
  whatsappLocationUrl: z.string().url().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
});

const quoteSchema = z.object({
  body: z.object({
    category: z.nativeEnum(DeliveryCategory),
    pickup: addressSchema,
    dropoff: addressSchema,
  }),
});

const createSchema = z.object({
  body: quoteSchema.shape.body.extend({
    scheduledFor: z.string().datetime().optional(),
    recipientName: z.string().optional(),
    recipientPhone: z.string().optional(),
    notes: z.string().max(500).optional(),
    paymentMethod: z.enum(['MTN_MOMO', 'PAYSTACK_CARD', 'WALLET', 'CASH_ON_DELIVERY']).optional(),
  }),
});

const statusSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ status: z.nativeEnum(DeliveryStatus) }),
});

deliveriesRouter.use(requireAuth);

deliveriesRouter.post(
  '/quote',
  validate(quoteSchema),
  asyncHandler(async (req, res) => ok(res, await service.quoteDelivery(req.body)))
);

deliveriesRouter.post(
  '/',
  requireRoles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.OPERATIONS),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const delivery = await service.createDelivery({
      ...req.body,
      customerId: req.user!.id,
    });
    const scheduledTime = delivery.scheduledFor?.getTime();
    if (scheduledTime && scheduledTime > Date.now()) {
      setTimeout(
        () => {
          void dispatchDelivery(delivery.id, req.app.get('io'));
        },
        Math.min(scheduledTime - Date.now(), 2_147_483_647)
      );
    } else {
      void dispatchDelivery(delivery.id, req.app.get('io'));
    }
    return created(res, delivery);
  })
);

deliveriesRouter.get(
  '/',
  asyncHandler(async (req, res) => ok(res, await service.listCustomerDeliveries(req.user!.id)))
);

deliveriesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => ok(res, await service.getDelivery(req.params.id!, req.user!.id)))
);

deliveriesRouter.patch(
  '/:id/status',
  requireRoles(UserRole.RIDER, UserRole.ADMIN, UserRole.OPERATIONS),
  validate(statusSchema),
  asyncHandler(async (req, res) =>
    ok(res, await service.updateDeliveryStatus(req.params.id!, req.body.status))
  )
);
