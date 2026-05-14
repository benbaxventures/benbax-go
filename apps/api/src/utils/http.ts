export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown> | undefined;

  constructor(statusCode: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (message = 'Resource not found') => new AppError(404, 'NOT_FOUND', message);
export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Permission denied') => new AppError(403, 'FORBIDDEN', message);
export const badRequest = (message = 'Invalid request', details?: Record<string, unknown>) =>
  new AppError(400, 'BAD_REQUEST', message, details);
