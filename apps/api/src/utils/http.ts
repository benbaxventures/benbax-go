export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown> | undefined;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
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
/**
 * The request was valid but the resource has moved on since the client last
 * looked (ride already taken, trip already started). Distinct from 400 so
 * clients can re-sync their view instead of asking the user to fix input.
 */
export const conflict = (
  message = 'This action conflicts with the current state',
  code = 'CONFLICT',
  details?: Record<string, unknown>
) => new AppError(409, code, message, details);
export const badGateway = (message = 'Upstream service error', details?: Record<string, unknown>) =>
  new AppError(502, 'BAD_GATEWAY', message, details);
