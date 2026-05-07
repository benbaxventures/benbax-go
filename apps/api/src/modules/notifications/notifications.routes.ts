import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/response';

export const notificationsRouter = Router();

const tokenSchema = z.object({
  body: z.object({
    token: z.string().min(10),
    platform: z.enum(['ios', 'android', 'web'])
  })
});

notificationsRouter.use(requireAuth);

notificationsRouter.post(
  '/device-tokens',
  validate(tokenSchema),
  asyncHandler(async (req, res) => {
    const token = await prisma.deviceToken.upsert({
      where: { token: req.body.token },
      create: {
        userId: req.user!.id,
        token: req.body.token,
        platform: req.body.platform
      },
      update: {
        userId: req.user!.id,
        platform: req.body.platform
      }
    });
    return ok(res, token);
  })
);

notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    return ok(res, notifications);
  })
);
