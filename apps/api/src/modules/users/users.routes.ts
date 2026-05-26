import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/response';
import { z } from 'zod';
import { validate } from '../../middleware/validate';

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get(
  '/me/saved-locations',
  asyncHandler(async (req, res) => {
    const locations = await prisma.savedLocation.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' }
    });
    return ok(res, locations);
  })
);

const updateMeSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional()
  })
});

usersRouter.patch(
  '/me',
  validate(updateMeSchema),
  asyncHandler(async (req, res) => {
    const data: Record<string, unknown> = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.email !== undefined) data.email = req.body.email;

    const updated = await prisma.user.update({ where: { id: req.user!.id }, data });
    // remove sensitive fields
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...user } = updated as any;
    return ok(res, user);
  })
);
