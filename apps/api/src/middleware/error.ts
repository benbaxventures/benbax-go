import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../utils/http';

type ErrorBody = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

function errorBody(code: string, message: string, details?: Record<string, unknown>): ErrorBody {
  return details
    ? { ok: false, error: { code, message, details } }
    : { ok: false, error: { code, message } };
}

/**
 * Anything that reaches here did not match a route. Express's own fallback
 * answers with an HTML page, which every client of this API then fails to
 * parse — the driver and passenger apps surface that as an opaque "the server
 * returned an invalid response". A JSON 404 lets them say what actually
 * happened, and lets an app that is newer than the deployed API detect a
 * missing endpoint by its code instead of by a parse failure.
 */
export const notFoundHandler: RequestHandler = (req, res) => {
  res
    .status(404)
    .json(errorBody('NOT_FOUND', `No API endpoint matches ${req.method} ${req.originalUrl}`));
};

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  // The response is already on the wire (e.g. a stream failed mid-write).
  // Writing a second one corrupts it — hand back to Express, which closes the
  // connection, and make sure the cause is still logged.
  if (res.headersSent) {
    logError(error, req);
    return next(error);
  }

  if (isDatabaseConnectionError(error)) {
    logError(error, req);
    return res
      .status(503)
      .json(
        errorBody(
          'DATABASE_UNAVAILABLE',
          'The service is temporarily unavailable. Please try again shortly.'
        )
      );
  }

  if (error instanceof AppError) {
    // Expected, already-classified failures: a business rule said no. Not
    // noise — log at info level so they can still be traced.
    if (error.statusCode >= 500) logError(error, req);
    return res.status(error.statusCode).json(errorBody(error.code, error.message, error.details));
  }

  // body-parser rejects malformed or oversized payloads before any handler.
  const parseFailure = bodyParserFailure(error);
  if (parseFailure) {
    return res.status(parseFailure.status).json(errorBody(parseFailure.code, parseFailure.message));
  }

  logError(error, req);

  // Never return the message or stack of an unexpected error: they carry
  // table names, file paths and connection strings. The full detail is in the
  // server log, keyed by method and path.
  return res
    .status(500)
    .json(
      errorBody(
        'INTERNAL_SERVER_ERROR',
        'Something went wrong on our server. Please try again shortly.'
      )
    );
};

function logError(error: unknown, req: { method: string; originalUrl: string }) {
  console.error(`[api] ${req.method} ${req.originalUrl} failed`, error);
}

function bodyParserFailure(error: unknown) {
  if (!(error instanceof Error)) return null;
  const type = (error as Error & { type?: string }).type;
  if (type === 'entity.too.large') {
    return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'That upload is too large.' };
  }
  if (type === 'entity.parse.failed' || error instanceof SyntaxError) {
    return { status: 400, code: 'BAD_REQUEST', message: 'The request body is not valid JSON.' };
  }
  return null;
}

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
