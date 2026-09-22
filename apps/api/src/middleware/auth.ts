import type { StaffRole } from '@prisma/client';
import { UserRole } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { forbidden, unauthorized } from '../utils/http';

export type AuthUser = {
  id: string;
  role: UserRole;
  /** Back-office privilege held alongside `role`; null for non-staff. */
  staffRole?: StaffRole | null;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      rawBody?: Buffer;
    }
  }
}

/**
 * Every role a request may be authorised under.
 *
 * An account carries one operational role plus, for staff, a second
 * back-office one — the ops lead who also drives is a DRIVER in the partner
 * app and an ADMIN in the dashboard from the same login. Permission checks ask
 * whether *any* hat fits, so neither gets in the other's way.
 */
export function rolesOf(user: Pick<AuthUser, 'role' | 'staffRole'>): UserRole[] {
  // StaffRole's members are a subset of UserRole's, so the key lookup is exact.
  return user.staffRole ? [user.role, UserRole[user.staffRole]] : [user.role];
}

/** True when the user holds back-office access, whatever their `role` says. */
export function isStaff(user: Pick<AuthUser, 'role' | 'staffRole'>): boolean {
  return rolesOf(user).some(
    (role) => role === UserRole.ADMIN || role === UserRole.OPERATIONS || role === UserRole.SUPPORT
  );
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

  if (!token) return next(unauthorized());

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthUser & { sub: string };
    req.user = { id: payload.sub, role: payload.role, staffRole: payload.staffRole ?? null };
    return next();
  } catch {
    return next(unauthorized('Invalid or expired token'));
  }
}

export function requireRoles(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!rolesOf(req.user).some((role) => roles.includes(role))) return next(forbidden());
    return next();
  };
}
