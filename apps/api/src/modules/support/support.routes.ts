import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { created, ok } from '../../utils/response';

export const supportRouter = Router();

const ticketSchema = z.object({
  body: z.object({
    deliveryId: z.string().optional(),
    subject: z.string().min(3),
    description: z.string().min(10),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL')
  })
});

supportRouter.use(requireAuth);

supportRouter.post(
  '/tickets',
  validate(ticketSchema),
  asyncHandler(async (req, res) =>
    created(
      res,
      await prisma.supportTicket.create({
        data: {
          requesterId: req.user!.id,
          deliveryId: req.body.deliveryId,
          subject: req.body.subject,
          description: req.body.description,
          priority: req.body.priority
        }
      })
    )
  )
);

supportRouter.get(
  '/tickets',
  asyncHandler(async (req, res) =>
    ok(
      res,
      await prisma.supportTicket.findMany({
        where: { requesterId: req.user!.id },
        orderBy: { createdAt: 'desc' }
      })
    )
  )
);
