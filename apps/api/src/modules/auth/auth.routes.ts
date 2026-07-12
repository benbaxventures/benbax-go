import { UserRole } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { created, ok } from '../../utils/response';
import * as service from './auth.service';

export const authRouter = Router();

const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    phone: z.string().min(8),
    email: z.string().email().optional(),
    password: z.string().min(8),
    role: z.nativeEnum(UserRole).optional(),
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
  asyncHandler(async (req, res) => created(res, await service.register(req.body)))
);

authRouter.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => ok(res, await service.login(req.body.phone, req.body.password)))
);

authRouter.post(
  '/refresh',
  validate(refreshSchema),
  asyncHandler(async (req, res) => ok(res, await service.refresh(req.body.refreshToken)))
);

authRouter.post(
  '/google',
  validate(googleLoginSchema),
  asyncHandler(async (req, res) =>
    ok(
      res,
      await service.googleLogin({
        accessToken: req.body.accessToken,
        idToken: req.body.idToken,
        role: req.body.role,
      })
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
