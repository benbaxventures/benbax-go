import type { Prisma } from '@prisma/client';
import { UserRole } from '@prisma/client';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { randomInt } from 'node:crypto';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { badRequest, notFound, unauthorized } from '../../utils/http';

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

export async function register(input: RegisterInput) {
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

  return {
    ...authPayload(user),
  };
}

export async function refresh(refreshToken: string) {
  let payload: { sub: string; role: UserRole };
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as { sub: string; role: UserRole };
  } catch {
    throw unauthorized('Invalid or expired refresh token');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw unauthorized('Invalid or expired refresh token');

  // Rotate both tokens so a fresh 30-day refresh window starts on every use.
  return authPayload(user);
}

export async function login(phone: string, password: string) {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user?.passwordHash) throw unauthorized('Invalid credentials');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw unauthorized('Invalid credentials');

  return authPayload(user);
}

export async function googleLogin(input: GoogleLoginInput) {
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
    return authPayload(user);
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

  return authPayload(user);
}

export async function forgotPassword(phone: string) {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) throw notFound('No account found with this phone number');

  const token = randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt },
  });

  return { message: 'Reset code sent' };
}

export async function resetPassword(phone: string, token: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) throw notFound('No account found with this phone number');

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
