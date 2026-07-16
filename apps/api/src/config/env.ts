import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().default(Number(process.env.PORT) || 4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  JWT_ACCESS_SECRET: z.string().min(24),
  JWT_REFRESH_SECRET: z.string().min(24),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:19006'),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  // Optional Expo access token for authenticated push sends (recommended in prod).
  EXPO_ACCESS_TOKEN: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  PAYSTACK_CALLBACK_URL: z.string().optional(),
  // Platform commission taken from each fare (0.10 = 10%). Driver keeps the rest.
  PLATFORM_COMMISSION_RATE: z.coerce.number().min(0).max(1).default(0.1),
  // Enable automated Paystack Transfers for driver payouts. When false (default),
  // withdrawals are created as PENDING for manual admin processing.
  PAYSTACK_TRANSFERS_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  // Paystack Ghana mobile-money bank code used for MoMo payout recipients (MTN | VOD | ATL).
  PAYSTACK_MOMO_BANK_CODE: z.string().default('MTN'),
  MTN_MOMO_BASE_URL: z.string().optional(),
  MTN_MOMO_SUBSCRIPTION_KEY: z.string().optional(),
  MTN_MOMO_API_USER: z.string().optional(),
  MTN_MOMO_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Hosted admin dashboard domains (Vercel). The production alias is stable; the
// per-deployment URLs are random, so they are matched by pattern. Kept in code
// so a dashboard deploy never silently breaks on a forgotten env update —
// additional origins can still be added via CORS_ORIGINS.
const ADMIN_DASHBOARD_ORIGIN_PATTERNS = [
  /^https:\/\/admin-henna-eta-88\.vercel\.app$/,
  /^https:\/\/admin-[a-z0-9]+-bright-anyawes-projects\.vercel\.app$/,
];

export function isAllowedOrigin(origin: string): boolean {
  if (corsOrigins.includes(origin)) return true;
  return ADMIN_DASHBOARD_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

// cors-package-compatible origin callback, shared by Express and Socket.IO.
export function corsOriginHandler(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
) {
  // Non-browser clients (curl, mobile apps, server-to-server) send no Origin.
  if (!origin || isAllowedOrigin(origin)) return callback(null, true);
  return callback(null, false);
}
