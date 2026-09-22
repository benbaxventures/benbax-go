import type { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

/**
 * Rate limiting.
 *
 * The limiter used to key on `req.ip` with `trust proxy` left off. Behind a
 * hosting proxy that makes `req.ip` the proxy's own address, so every driver,
 * passenger and admin on the platform shared a single 200-requests / 15-minute
 * bucket: one busy driver could lock everybody else out, and the 10-attempt
 * sign-in limiter meant ten failed logins platform-wide blocked sign-in for
 * everyone. `trust proxy` is set in app.ts so `req.ip` is the real client, and
 * authenticated traffic is keyed per user so one client's runaway loop can
 * never starve another user.
 */

/** JSON that matches the API's error envelope, so clients parse 429 like any other failure. */
function limitBody(message: string) {
  return { ok: false, error: { code: 'RATE_LIMITED', message } };
}

/**
 * Identify the caller. A valid access token means we know exactly who this is,
 * so they get their own budget; everything else falls back to the client IP
 * (IPv6-normalised by express-rate-limit's helper). The token is verified, not
 * just decoded — an unverified `sub` would let anyone mint a fresh bucket.
 */
async function identityKey(req: Request): Promise<string> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (token) {
    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as { sub?: string };
      if (payload.sub) return `user:${payload.sub}`;
    } catch {
      // Fall through to the IP key: an expired or forged token is anonymous.
    }
  }
  return `ip:${ipKeyGenerator(req.ip ?? '', 56)}`;
}

/**
 * Ceiling for normal API traffic, per user (or per IP when signed out).
 *
 * The driver app's steady state while online with a trip running is roughly
 * 160 requests per 15 minutes — availability updates, the open-request and
 * passenger-presence safety-net polls, and live tracking points. The default
 * leaves several times that as headroom, so it only ever trips on a genuine
 * request loop, never on normal use. Tunable without a redeploy.
 */
export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: identityKey,
  message: limitBody('Too many requests, please try again shortly'),
});

/**
 * Sign-in, registration and password reset: per IP, and deliberately tight,
 * because this is the brute-force surface. Successful requests are not
 * counted, so somebody signing in normally never uses the budget up.
 */
export const authLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req: Request) => `ip:${ipKeyGenerator(req.ip ?? '', 56)}`,
  message: limitBody('Too many sign-in attempts, please try again later'),
});
