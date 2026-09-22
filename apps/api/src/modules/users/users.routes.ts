import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { badRequest, conflict, notFound } from '../../utils/http';
import { needsPhoneNumber, normalizePhoneNumber, phoneLookupVariants } from '../../utils/phone';
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

const setPhoneSchema = z.object({
  body: z.object({
    phone: z.string().min(1),
  }),
});

/**
 * Claim a phone number for an account that has none.
 *
 * Google sign-up cannot supply one — Google's userinfo endpoint returns no
 * phone number under any scope — so those accounts are created holding a
 * `google:<sub>` placeholder. Without a real number the owner cannot be
 * called by their driver or passenger, cannot receive an SMS or WhatsApp
 * password-reset code, and cannot sign in by phone. This is where they fix
 * that, and it is the only way a phone number can be added after sign-up.
 *
 * Deliberately one-way: a number can be claimed but not changed here, because
 * swapping the identifier an account signs in with needs the number verified
 * first. Support handles changes until an OTP step exists.
 */
usersRouter.patch(
  '/me/phone',
  validate(setPhoneSchema),
  asyncHandler(async (req, res) => {
    const phone = normalizePhoneNumber(req.body.phone);
    if (!phone) throw badRequest('Enter a valid phone number, for example 059 417 2522');

    const current = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { phone: true },
    });
    if (!current) throw notFound('Account not found');

    if (!needsPhoneNumber(current.phone)) {
      if (normalizePhoneNumber(current.phone) === phone) {
        return ok(res, { phone, alreadySet: true });
      }
      throw conflict(
        'This account already has a phone number. Contact Benbax support to change it.',
        'PHONE_ALREADY_SET'
      );
    }

    // The column is unique, and old rows hold several spellings of the same
    // number, so every variant has to be checked — not just the E.164 form.
    const taken = await prisma.user.findFirst({
      where: { phone: { in: phoneLookupVariants(phone) }, NOT: { id: req.user!.id } },
      select: { id: true },
    });
    if (taken) {
      throw conflict(
        'That phone number is already registered to another Benbax account.',
        'PHONE_IN_USE'
      );
    }

    await prisma.user.update({ where: { id: req.user!.id }, data: { phone } });
    return ok(res, { phone, alreadySet: false });
  })
);

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
