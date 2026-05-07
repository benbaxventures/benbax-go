import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { badRequest, unauthorized } from '../../utils/http';

type RegisterInput = {
  name: string;
  phone: string;
  email?: string;
  password: string;
  role?: UserRole;
};

function signAccessToken(user: { id: string; role: UserRole }) {
  return jwt.sign({ role: user.role }, env.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: env.JWT_ACCESS_TTL
  });
}

function signRefreshToken(user: { id: string; role: UserRole }) {
  return jwt.sign({ role: user.role }, env.JWT_REFRESH_SECRET, {
    subject: user.id,
    expiresIn: env.JWT_REFRESH_TTL
  });
}

export async function register(input: RegisterInput) {
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ phone: input.phone }, ...(input.email ? [{ email: input.email }] : [])]
    }
  });

  if (existing) throw badRequest('Phone or email already exists');

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      phone: input.phone,
      email: input.email,
      passwordHash,
      role: input.role ?? UserRole.CUSTOMER,
      wallet: { create: {} },
      riderProfile:
        input.role === UserRole.RIDER
          ? {
              create: {}
            }
          : undefined
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      role: true
    }
  });

  return {
    user,
    tokens: {
      accessToken: signAccessToken(user),
      refreshToken: signRefreshToken(user)
    }
  };
}

export async function login(phone: string, password: string) {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user?.passwordHash) throw unauthorized('Invalid credentials');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw unauthorized('Invalid credentials');

  return {
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      role: user.role
    },
    tokens: {
      accessToken: signAccessToken(user),
      refreshToken: signRefreshToken(user)
    }
  };
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
      riderProfile: true
    }
  });
}
