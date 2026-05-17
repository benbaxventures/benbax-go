import compression from 'compression';
import cors from 'cors';
import express from 'express';
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
      credentials: true
    })
  );
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan('tiny'));

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
          database: 'unavailable'
        }
      });
    }
  });

  app.use('/api/v1', apiRouter);
  app.use(errorHandler);

  return app;
}
