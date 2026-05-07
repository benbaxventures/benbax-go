import { Router } from 'express';
import { UserRole } from '@prisma/client';
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
    role: z.nativeEnum(UserRole).optional()
  })
});

const loginSchema = z.object({
  body: z.object({
    phone: z.string().min(8),
    password: z.string().min(8)
  })
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

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => ok(res, await service.me(req.user!.id)))
);
