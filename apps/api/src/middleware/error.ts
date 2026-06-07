import type { ErrorRequestHandler } from 'express';
import { AppError } from '../utils/http';

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (isDatabaseConnectionError(error)) {
    console.error(error);

    return res.status(503).json({
      ok: false,
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database is unavailable. Start Postgres and try again.',
      },
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
  }

  console.error(error);

  const isProd = process.env.NODE_ENV === 'production';
  const message =
    !isProd && error instanceof Error && error.message ? error.message : 'Something went wrong';
  const details = !isProd && error instanceof Error ? { stack: error.stack } : undefined;

  return res.status(500).json({
    ok: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message,
      details,
    },
  });
};

function isDatabaseConnectionError(error: unknown) {
  if (!(error instanceof Error)) return false;

  const knownPrismaConnectionErrorNames = new Set([
    'PrismaClientInitializationError',
    'PrismaClientKnownRequestError',
    'PrismaClientUnknownRequestError',
  ]);

  if (!knownPrismaConnectionErrorNames.has(error.name)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes("can't reach database server") ||
    message.includes('database server is running') ||
    message.includes('connect econrefused') ||
    message.includes('connection refused')
  );
}
