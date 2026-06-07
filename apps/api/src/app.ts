import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import { corsOrigins } from './config/env';
import { prisma } from './config/prisma';
import { errorHandler } from './middleware/error';
import { apiRouter } from './routes';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    })
  );
  app.use(compression());
  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buffer) => {
        (req as express.Request).rawBody = buffer;
      },
    })
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan('tiny'));

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      ok: false,
      error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests, please try again later' },
    },
  });
  app.use('/api/', limiter);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      ok: false,
      error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts, please try again later' },
    },
  });
  app.use('/api/v1/auth/login', authLimiter);
  app.use('/api/v1/auth/register', authLimiter);
  app.use('/api/v1/auth/forgot-password', authLimiter);
  app.use('/api/v1/auth/reset-password', authLimiter);

  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, status: 'healthy', service: 'benbax-api', uptime: process.uptime() });
    } catch (error) {
      console.error(error);
      res.status(503).json({
        ok: false,
        status: 'unavailable',
        service: 'benbax-api',
        dependencies: {
          database: 'unavailable',
        },
      });
    }
  });

  app.use('/api/v1', apiRouter);
  app.use(errorHandler);

  return app;
}
