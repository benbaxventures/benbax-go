import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { corsOriginHandler, env } from './config/env';
import { prisma } from './config/prisma';
import { errorHandler, notFoundHandler } from './middleware/error';
import { apiLimiter, authLimiter } from './middleware/rateLimit';
import { apiRouter } from './routes';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Resolve `req.ip` from X-Forwarded-For so rate limiting, logging and abuse
  // controls see the real caller instead of the hosting proxy.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.use(helmet());
  app.use(
    cors({
      origin: corsOriginHandler,
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

  app.use('/api/', apiLimiter);

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
  // Unmatched API paths must still answer with the JSON envelope; Express's
  // built-in fallback would send HTML that no client of this API can read.
  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
