import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/response';

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get(
  '/me/saved-locations',
  asyncHandler(async (req, res) => {
    const locations = await prisma.savedLocation.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
    });
    return ok(res, locations);
  })
);

const updateMeSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
  }),
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

usersRouter.delete(
  '/me',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.passwordResetToken.deleteMany({ where: { userId } });
      await tx.deviceToken.deleteMany({ where: { userId } });

      await tx.user.update({
        where: { id: userId },
        data: {
          status: 'DELETED',
          name: 'Deleted User',
          phone: `deleted:${userId}`,
          email: null,
          passwordHash: null,
          avatarUrl: null,
        },
      });
    });

    return ok(res, { message: 'Account deleted successfully' });
  })
);

usersRouter.get(
  '/me/data',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        wallet: true,
        savedPlaces: true,
        deliveries: {
          take: 50,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const { passwordHash, ...safe } = user as any;
    void passwordHash;
    return ok(res, safe);
  })
);
