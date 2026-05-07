import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/response';

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
