import type { Prisma } from '@prisma/client';
import { UserRole } from '@prisma/client';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { createHash, randomInt } from 'node:crypto';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { badRequest, notFound, unauthorized } from '../../utils/http';
import { notify } from '../notifications/notify';

type RegisterInput = {
  name: string;
  phone: string;
  email?: string;
  password: string;
  role?: UserRole;
};

type GoogleLoginInput = {
  accessToken?: string;
  idToken?: string;
  role?: UserRole;
};

export type SessionContext = {
  userAgent?: string | null;
  ipAddress?: string | null;
};

type GoogleProfile = {
  sub: string;
  email: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
};

function signAccessToken(user: { id: string; role: UserRole }) {
  const options: SignOptions = {
    subject: user.id,
    expiresIn: env.JWT_ACCESS_TTL as NonNullable<SignOptions['expiresIn']>,
  };

  return jwt.sign({ role: user.role }, env.JWT_ACCESS_SECRET, {
    ...options,
  });
}

function signRefreshToken(user: { id: string; role: UserRole }) {
  const options: SignOptions = {
    subject: user.id,
    expiresIn: env.JWT_REFRESH_TTL as NonNullable<SignOptions['expiresIn']>,
  };

  return jwt.sign({ role: user.role }, env.JWT_REFRESH_SECRET, {
    ...options,
  });
}

function authPayload(user: {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: UserRole;
}) {
  return {
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      role: user.role,
    },
    tokens: {
      accessToken: signAccessToken(user),
      refreshToken: signRefreshToken(user),
    },
  };
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

// Sign-in and password recovery both accept a single identifier that may be
// either the account phone or email. Both columns are unique, so an OR lookup
// resolves to at most one user.
function findUserByIdentifier(identifier: string) {
  const value = identifier.trim();
  return prisma.user.findFirst({
    where: { OR: [{ phone: value }, { email: value }] },
  });
}

const FALLBACK_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Persists a session record for the issued refresh token so the admin panel
// can show active devices/IPs per account. Never blocks authentication.
async function persistSession(userId: string, refreshToken: string, ctx?: SessionContext) {
  try {
    const decoded = jwt.decode(refreshToken) as { exp?: number } | null;
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + FALLBACK_SESSION_TTL_MS);
    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        userAgent: ctx?.userAgent ?? null,
        ipAddress: ctx?.ipAddress ?? null,
        expiresAt,
      },
    });
  } catch (error) {
    console.error('Failed to persist session', { userId, error });
  }
}

async function revokeSession(refreshToken: string) {
  try {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch (error) {
    console.error('Failed to revoke session', { error });
  }
}

// Stamps lastSeenAt and writes an audit trail entry so the admin dashboard can
// show registration/login history. Failures must never block authentication.
async function recordAuthEvent(
  userId: string,
  action: 'USER_REGISTERED' | 'USER_LOGIN',
  metadata: Prisma.InputJsonValue
) {
  try {
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } }),
      prisma.auditLog.create({
        data: { actorId: userId, action, entity: 'User', entityId: userId, metadata },
      }),
    ]);
  } catch (error) {
    console.error('Failed to record auth event', { userId, action, error });
  }
}

async function touchLastSeen(userId: string) {
  try {
    await prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } });
  } catch (error) {
    console.error('Failed to update lastSeenAt', { userId, error });
  }
}

function isEmailVerified(value: GoogleProfile['email_verified']) {
  return value === true || value === 'true';
}

async function getGoogleProfile(input: GoogleLoginInput): Promise<GoogleProfile> {
  if (input.accessToken) {
    const { data } = await axios.get<GoogleProfile>(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: { Authorization: `Bearer ${input.accessToken}` },
        timeout: 10000,
      }
    );
    return data;
  }

  if (input.idToken) {
    const { data } = await axios.get<GoogleProfile>('https://oauth2.googleapis.com/tokeninfo', {
      params: { id_token: input.idToken },
      timeout: 10000,
    });
    return data;
  }

  throw unauthorized('Google token is required');
}

export async function register(input: RegisterInput, ctx?: SessionContext) {
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ phone: input.phone }, ...(input.email ? [{ email: input.email }] : [])],
    },
  });

  if (existing) throw badRequest('Phone or email already exists');

  const passwordHash = await bcrypt.hash(input.password, 12);
  const createData: Prisma.UserCreateInput = {
    name: input.name,
    phone: input.phone,
    email: input.email ?? null,
    passwordHash,
    role: input.role ?? UserRole.CUSTOMER,
    wallet: { create: {} },
  };

  if (input.role === UserRole.RIDER) {
    createData.riderProfile = { create: {} };
  }
  if (input.role === UserRole.DRIVER) {
    createData.driverProfile = { create: {} };
  }

  const user = await prisma.user.create({
    data: createData,
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      role: true,
    },
  });

  await recordAuthEvent(user.id, 'USER_REGISTERED', { role: user.role, method: 'password' });

  const payload = authPayload(user);
  await persistSession(user.id, payload.tokens.refreshToken, ctx);
  return payload;
}

export async function refresh(refreshToken: string, ctx?: SessionContext) {
  let payload: { sub: string; role: UserRole };
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as { sub: string; role: UserRole };
  } catch {
    throw unauthorized('Invalid or expired refresh token');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw unauthorized('Invalid or expired refresh token');

  await touchLastSeen(user.id);

  // Rotate both tokens so a fresh 30-day refresh window starts on every use.
  const result = authPayload(user);
  await revokeSession(refreshToken);
  await persistSession(user.id, result.tokens.refreshToken, ctx);
  return result;
}

export async function login(identifier: string, password: string, ctx?: SessionContext) {
  const user = await findUserByIdentifier(identifier);
  if (!user?.passwordHash) throw unauthorized('Invalid credentials');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw unauthorized('Invalid credentials');

  await recordAuthEvent(user.id, 'USER_LOGIN', { method: 'password' });

  const payload = authPayload(user);
  await persistSession(user.id, payload.tokens.refreshToken, ctx);
  return payload;
}

export async function googleLogin(input: GoogleLoginInput, ctx?: SessionContext) {
  let profile: GoogleProfile;
  try {
    profile = await getGoogleProfile(input);
  } catch {
    throw unauthorized('Google sign-in failed');
  }

  if (!profile.email || !isEmailVerified(profile.email_verified)) {
    throw unauthorized('Google account email is not verified');
  }

  const requestedRole = input.role ?? UserRole.CUSTOMER;
  if (
    requestedRole !== UserRole.CUSTOMER &&
    requestedRole !== UserRole.RIDER &&
    requestedRole !== UserRole.DRIVER
  ) {
    throw badRequest('Google sign-in is only available for customers, riders, and drivers');
  }
  const role: 'CUSTOMER' | 'RIDER' | 'DRIVER' = requestedRole;

  const existing = await prisma.user.findUnique({ where: { email: profile.email } });
  if (existing) {
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: existing.name || profile.name || profile.email,
        avatarUrl: existing.avatarUrl ?? profile.picture ?? null,
        lastSeenAt: new Date(),
      },
    });
    await recordAuthEvent(user.id, 'USER_LOGIN', { method: 'google' });
    const payload = authPayload(user);
    await persistSession(user.id, payload.tokens.refreshToken, ctx);
    return payload;
  }

  const user = await prisma.user.create({
    data: {
      name: profile.name || profile.email,
      email: profile.email,
      phone: `google:${profile.sub}`,
      avatarUrl: profile.picture ?? null,
      role,
      wallet: { create: {} },
      ...(role === UserRole.RIDER ? { riderProfile: { create: {} } } : {}),
      ...(role === UserRole.DRIVER ? { driverProfile: { create: {} } } : {}),
    },
  });

  await recordAuthEvent(user.id, 'USER_REGISTERED', { role, method: 'google' });

  const payload = authPayload(user);
  await persistSession(user.id, payload.tokens.refreshToken, ctx);
  return payload;
}

export async function forgotPassword(identifier: string) {
  const user = await findUserByIdentifier(identifier);
  if (!user) throw notFound('No account found with that email or phone number');

  const token = randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt },
  });

  // Actually deliver the code. Fan it out across every 1:1 channel the account
  // can receive on (email, SMS, WhatsApp) plus the in-app feed. Best-effort:
  // any unconfigured channel silently no-ops, so whichever gateway is set up
  // delivers it. Without this the code was only ever written to the DB.
  void notify(
    { userIds: [user.id], channels: ['inapp', 'email', 'sms', 'whatsapp'] },
    {
      title: 'Benbax password reset code',
      body: `Your password reset code is ${token}. It expires in 15 minutes. If you didn't request this, you can ignore this message.`,
    }
  );

  // Dev fallback: when no paid SMS/email gateway is configured, surface the code
  // in the server log so the reset flow stays usable locally. Never in prod —
  // logging or returning the code there would let anyone reset any account.
  if (env.NODE_ENV !== 'production') {
    console.info(`[auth] Password reset code for ${identifier}: ${token}`);
  }

  return { message: 'Reset code sent' };
}

export async function resetPassword(identifier: string, token: string, newPassword: string) {
  const user = await findUserByIdentifier(identifier);
  if (!user) throw notFound('No account found with that email or phone number');

  const resetToken = await prisma.passwordResetToken.findFirst({
    where: { token, userId: user.id, usedAt: null, expiresAt: { gte: new Date() } },
  });
  if (!resetToken) throw badRequest('Invalid or expired reset code');

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return { message: 'Password updated successfully' };
}

export async function me(userId: string) {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      role: true,
      avatarUrl: true,
      wallet: true,
      riderProfile: true,
      driverProfile: true,
    },
  });
}
