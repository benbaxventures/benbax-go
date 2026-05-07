import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { requireAuth, requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/response';

export const geofencesRouter = Router();

const upsertSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    city: z.string().min(2),
    polygon: z.array(z.object({ latitude: z.number(), longitude: z.number() })).min(3),
    baseMultiplier: z.number().min(0.5).max(5).default(1)
  })
});

geofencesRouter.use(requireAuth);

geofencesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const geofences = await prisma.geofence.findMany({
      where: { isActive: true },
      orderBy: { city: 'asc' }
    });
    return ok(res, geofences);
  })
);

geofencesRouter.post(
  '/',
  requireRoles(UserRole.ADMIN, UserRole.OPERATIONS),
  validate(upsertSchema),
  asyncHandler(async (req, res) => ok(res, await prisma.geofence.create({ data: req.body })))
);
