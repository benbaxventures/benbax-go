import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  apiErrorCodes,
  formatRetryAfter,
  isSafeToDisplay,
  userFacingApiMessage,
  userFacingMessages,
} from '../src/apiErrors';

describe('userFacingApiMessage', () => {
  it('asks the user to wait on a rate limit', () => {
    assert.equal(
      userFacingApiMessage({ status: 429, code: apiErrorCodes.rateLimited }),
      userFacingMessages.rateLimited
    );
  });

  it('names the wait when the server sent Retry-After', () => {
    assert.equal(
      userFacingApiMessage({ status: 429, retryAfterSeconds: 45 }),
      'Too many requests. Please wait 45 seconds and try again.'
    );
    assert.equal(
      userFacingApiMessage({ status: 429, retryAfterSeconds: 120 }),
      'Too many requests. Please wait 2 minutes and try again.'
    );
  });

  it('explains a connectivity failure', () => {
    assert.equal(userFacingApiMessage({ status: 0 }), userFacingMessages.network);
    assert.equal(
      userFacingApiMessage({ status: 0, message: 'Network request failed' }),
      userFacingMessages.network
    );
  });

  it('tells the user to sign in again on an auth failure', () => {
    assert.equal(
      userFacingApiMessage({ status: 401, message: 'Invalid or expired token' }),
      userFacingMessages.sessionExpired
    );
  });

  it('keeps a safe business-rule message from the backend', () => {
    assert.equal(
      userFacingApiMessage({
        status: 409,
        code: 'DRIVER_BUSY',
        message: 'Finish or cancel your current trip before accepting another.',
      }),
      'Finish or cancel your current trip before accepting another.'
    );
    assert.equal(
      userFacingApiMessage({
        status: 409,
        code: 'RIDE_NOT_RELEASABLE',
        message: 'This trip has already started. End the trip instead of releasing it.',
      }),
      'This trip has already started. End the trip instead of releasing it.'
    );
  });

  it('hides server faults behind a generic message', () => {
    // Regression: a 500 body must never put internals on a user's screen.
    assert.equal(
      userFacingApiMessage({
        status: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Invalid `prisma.rideTrip.findUnique()` invocation',
      }),
      userFacingMessages.server
    );
    assert.equal(userFacingApiMessage({ status: 503 }), userFacingMessages.server);
  });

  it('treats an unreadable body as a server fault, not a user error', () => {
    // This is the failure the apps used to report as "the server returned an
    // invalid response. Check the API logs and try again."
    assert.equal(
      userFacingApiMessage({
        status: 502,
        code: apiErrorCodes.invalidResponse,
        message: 'Unreadable response from /rides (HTTP 502)',
      }),
      userFacingMessages.server
    );
  });

  it('falls back per status when the backend message is unusable', () => {
    assert.equal(
      userFacingApiMessage({ status: 403, message: '   ' }),
      userFacingMessages.forbidden
    );
    assert.equal(userFacingApiMessage({ status: 404 }), userFacingMessages.notFound);
    assert.equal(userFacingApiMessage({ status: 418 }), userFacingMessages.unknown);
  });
});

describe('isSafeToDisplay', () => {
  it('accepts sentences written for a person', () => {
    assert.equal(isSafeToDisplay('Another driver already accepted this ride.'), true);
    assert.equal(isSafeToDisplay('You are not the driver assigned to this ride'), true);
  });

  it('rejects anything that leaks internals', () => {
    for (const leak of [
      'PrismaClientInitializationError: cannot reach database server',
      'Invalid `prisma.user.findMany()` invocation:',
      'connect ECONNREFUSED 127.0.0.1:5432',
      'postgresql://user:secret@host:5432/db is unreachable',
      'TypeError: Cannot read properties of undefined',
      '    at Object.handler (/srv/api/dist/src/routes.js:42:11)',
      'SELECT id FROM users WHERE phone = $1',
      'Error at /app/node_modules/express/lib/router.js:1',
      'line one\nline two',
      '',
    ]) {
      assert.equal(isSafeToDisplay(leak), false, `should have rejected: ${leak}`);
    }
  });

  it('rejects anything too long to be a sentence', () => {
    assert.equal(isSafeToDisplay('x'.repeat(201)), false);
  });
});

describe('formatRetryAfter', () => {
  it('phrases waits for people', () => {
    assert.equal(formatRetryAfter(30), '30 seconds');
    assert.equal(formatRetryAfter(60), 'a minute');
    assert.equal(formatRetryAfter(300), '5 minutes');
    assert.equal(formatRetryAfter(0), null);
    assert.equal(formatRetryAfter(null), null);
    assert.equal(formatRetryAfter(undefined), null);
  });
});
