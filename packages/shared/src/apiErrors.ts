/**
 * The single place that decides what a user is told when an API call fails.
 *
 * Clients never show a raw transport failure ("Unexpected token < in JSON") or
 * a raw server string. They classify the failure — HTTP status first, then the
 * error `code` the API returned — and pick a message a passenger or driver can
 * act on. A safe, specific message from the backend (a validation or
 * business-rule failure) always wins over a generic one; anything that could
 * leak internals is replaced.
 */

/** Error codes the API returns in `{ ok: false, error: { code } }`. */
export const apiErrorCodes = {
  badRequest: 'BAD_REQUEST',
  unauthorized: 'UNAUTHORIZED',
  forbidden: 'FORBIDDEN',
  notFound: 'NOT_FOUND',
  conflict: 'CONFLICT',
  rateLimited: 'RATE_LIMITED',
  internal: 'INTERNAL_SERVER_ERROR',
  databaseUnavailable: 'DATABASE_UNAVAILABLE',
  badGateway: 'BAD_GATEWAY',
  /** The response body was not the JSON envelope the API always sends. */
  invalidResponse: 'INVALID_RESPONSE',
  /** The request never reached the server (DNS, offline, timeout). */
  network: 'NETWORK_ERROR',
  // --- ride dispatch -------------------------------------------------------
  driverBusy: 'DRIVER_BUSY',
  driverSuspended: 'DRIVER_SUSPENDED',
  rideUnavailable: 'RIDE_UNAVAILABLE',
  /** The caller is not the driver currently assigned to this ride. */
  notTripDriver: 'NOT_TRIP_DRIVER',
  /** The ride has started or ended, so it can no longer be handed back. */
  rideNotReleasable: 'RIDE_NOT_RELEASABLE',
} as const;

export type ApiErrorCode = (typeof apiErrorCodes)[keyof typeof apiErrorCodes];

export const userFacingMessages = {
  rateLimited: 'Too many requests. Please wait a moment and try again.',
  network: 'Unable to connect to the server. Please check your internet connection and try again.',
  sessionExpired: 'Your session has expired. Please sign in again.',
  forbidden: 'You do not have permission to do that.',
  notFound: 'We could not find what you were looking for.',
  server: 'Something went wrong on our server. Please try again shortly.',
  unknown: 'Something went wrong. Please try again.',
} as const;

/** How long to wait before retrying, phrased for a person. */
export function formatRetryAfter(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds < 60) return `${Math.ceil(seconds)} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? 'a minute' : `${minutes} minutes`;
}

/**
 * A backend message is shown verbatim only when it reads like something a
 * person wrote for a person. Stack traces, SQL, Prisma output, connection
 * strings and file paths are internal detail and are replaced with a generic
 * message — they belong in the logs, not on a phone screen.
 */
export function isSafeToDisplay(message: string | null | undefined): message is string {
  if (!message) return false;
  const value = message.trim();
  if (value.length === 0 || value.length > 200) return false;
  if (/\n/.test(value)) return false;
  return !(
    /\b(at\s+\w+\s*\(|\.ts:\d+|\.js:\d+|node_modules|prisma|postgres(ql)?:\/\/|redis:\/\/|econnrefused|syntaxerror|typeerror|referenceerror|undefined is not|cannot read propert|invocation:)/i.test(
      value
    ) || /\b(select|insert into|update .* set|delete from)\b .*\b(from|where|values)\b/i.test(value)
  );
}

export type ApiFailure = {
  /** HTTP status, or 0 when the request never got a response. */
  status: number;
  /** `error.code` from the API envelope, when there was one. */
  code?: string | null;
  /** `error.message` from the API envelope, when there was one. */
  message?: string | null;
  /** Seconds from a `Retry-After` header, when the server sent one. */
  retryAfterSeconds?: number | null;
};

/**
 * Turns an API failure into the sentence a user should read.
 *
 * Order matters: transport and session problems are classified by status
 * because their bodies are unreliable, while 4xx business failures prefer the
 * backend's own wording — that is where the useful reason lives ("Finish your
 * current trip before accepting another").
 */
export function userFacingApiMessage(failure: ApiFailure): string {
  const { status, code } = failure;
  const message = failure.message ?? null;

  if (status === 0 || code === apiErrorCodes.network) {
    return userFacingMessages.network;
  }

  if (status === 429 || code === apiErrorCodes.rateLimited) {
    const wait = formatRetryAfter(failure.retryAfterSeconds);
    return wait
      ? `Too many requests. Please wait ${wait} and try again.`
      : userFacingMessages.rateLimited;
  }

  if (status === 401 || code === apiErrorCodes.unauthorized) {
    return userFacingMessages.sessionExpired;
  }

  // A 503 from our own database guard has a deliberately friendly message, but
  // it names our infrastructure — treat every 5xx as "our fault, try later".
  if (status >= 500 || code === apiErrorCodes.internal || code === apiErrorCodes.badGateway) {
    return userFacingMessages.server;
  }

  // The response was not our JSON envelope at all (an HTML error page from a
  // proxy, an empty body, a truncated read). There is nothing safe to quote.
  if (code === apiErrorCodes.invalidResponse) {
    return userFacingMessages.server;
  }

  // 4xx: the backend's reason is the whole point of the response — show it
  // whenever it is safe, and fall back per status when it is not.
  if (isSafeToDisplay(message)) return message;

  if (status === 403) return userFacingMessages.forbidden;
  if (status === 404) return userFacingMessages.notFound;
  return userFacingMessages.unknown;
}
