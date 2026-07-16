import { UserRole } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { realtimeEvents } from '../../realtime/events';
import { asyncHandler } from '../../utils/asyncHandler';
import { created, ok } from '../../utils/response';
import { sendExpoPushToRole } from '../notifications/push';
import * as service from './auth.service';

export const authRouter = Router();

function sessionContext(req: { headers: Record<string, unknown>; ip?: string | undefined }) {
  const userAgent = req.headers['user-agent'];
  return {
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 255) : null,
    ipAddress: req.ip ?? null,
  };
}

const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    phone: z.string().min(8),
    email: z.string().email().optional(),
    password: z.string().min(8),
    // Public self-registration is for end users only. Staff accounts (ADMIN,
    // OPERATIONS, SUPPORT) must be provisioned by an existing admin or seed —
    // accepting them here would let anyone mint an admin account.
    role: z.enum([UserRole.CUSTOMER, UserRole.RIDER, UserRole.DRIVER]).optional(),
  }),
});

const loginSchema = z.object({
  body: z.object({
    phone: z.string().min(8),
    password: z.string().min(8),
  }),
});

const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1),
  }),
});

const googleLoginSchema = z.object({
  body: z
    .object({
      accessToken: z.string().optional(),
      idToken: z.string().optional(),
      role: z.nativeEnum(UserRole).optional(),
    })
    .refine((body) => body.accessToken || body.idToken, {
      message: 'Google access token or ID token is required',
    }),
});

authRouter.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await service.register(req.body, sessionContext(req));

    // Notify drivers when a new passenger joins: an in-app realtime event for
    // drivers who are online, plus a push for those who aren't.
    if (result.user.role === UserRole.CUSTOMER) {
      const io = req.app.get('io');
      io?.to('drivers').emit(realtimeEvents.clientRegistered, {
        id: result.user.id,
        name: result.user.name,
        joinedAt: new Date().toISOString(),
      });
      void sendExpoPushToRole(UserRole.DRIVER, {
        title: 'New passenger on Benbax',
        body: `${result.user.name} just joined. More riders means more trips.`,
        data: { type: 'client-registered', clientId: result.user.id },
      });
    }

    return created(res, result);
  })
);

authRouter.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) =>
    ok(res, await service.login(req.body.phone, req.body.password, sessionContext(req)))
  )
);

authRouter.post(
  '/refresh',
  validate(refreshSchema),
  asyncHandler(async (req, res) =>
    ok(res, await service.refresh(req.body.refreshToken, sessionContext(req)))
  )
);

authRouter.post(
  '/google',
  validate(googleLoginSchema),
  asyncHandler(async (req, res) =>
    ok(
      res,
      await service.googleLogin(
        {
          accessToken: req.body.accessToken,
          idToken: req.body.idToken,
          role: req.body.role,
        },
        sessionContext(req)
      )
    )
  )
);

const forgotPasswordSchema = z.object({
  body: z.object({ phone: z.string().min(8) }),
});

const resetPasswordSchema = z.object({
  body: z.object({
    phone: z.string().min(8),
    token: z.string().length(6),
    newPassword: z.string().min(8),
  }),
});

authRouter.post(
  '/forgot-password',
  validate(forgotPasswordSchema),
  asyncHandler(async (req, res) => ok(res, await service.forgotPassword(req.body.phone)))
);

authRouter.post(
  '/reset-password',
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) =>
    ok(res, await service.resetPassword(req.body.phone, req.body.token, req.body.newPassword))
  )
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => ok(res, await service.me(req.user!.id)))
);
