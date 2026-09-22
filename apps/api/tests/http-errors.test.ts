import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

// Must be set before anything pulls in src/config/env. Pointing dotenv at a
// file that does not exist keeps the real apps/api/.env — production
// credentials — out of the test process entirely.
process.env.DOTENV_CONFIG_PATH = 'tests/.env.does-not-exist';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:59999/benbax_test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-must-be-at-least-24-chars';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-must-be-at-least-24-chars';
delete process.env.REDIS_URL;
// Small enough to trip deliberately inside a test.
process.env.RATE_LIMIT_MAX = '4';
process.env.RATE_LIMIT_WINDOW_MS = '60000';
process.env.AUTH_RATE_LIMIT_MAX = '2';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

type Probe = {
  status: number;
  contentType: string | null;
  retryAfter: string | null;
  text: string;
  json: unknown;
  parsedAsJson: boolean;
};

let server: http.Server;
let baseUrl: string;

function tokenFor(userId: string, role = 'DRIVER') {
  return jwt.sign({ sub: userId, role }, ACCESS_SECRET, { expiresIn: '5m' });
}

async function request(
  method: string,
  path: string,
  options: { token?: string; body?: string } = {}
): Promise<Probe> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body != null ? { body: options.body } : {}),
  });
  const text = await response.text();
  let json: unknown = null;
  let parsedAsJson = true;
  try {
    json = JSON.parse(text);
  } catch {
    parsedAsJson = false;
  }
  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    retryAfter: response.headers.get('retry-after'),
    text,
    json,
    parsedAsJson,
  };
}

/** Every failure the API returns must be this exact envelope. */
function assertErrorEnvelope(probe: Probe, expected: { status: number; code: string }) {
  assert.equal(probe.status, expected.status);
  assert.ok(probe.parsedAsJson, `expected JSON, got: ${probe.text.slice(0, 120)}`);
  assert.match(probe.contentType ?? '', /application\/json/);
  const body = probe.json as { ok?: boolean; error?: { code?: string; message?: string } };
  assert.equal(body.ok, false);
  assert.equal(body.error?.code, expected.code);
  assert.equal(typeof body.error?.message, 'string');
  assert.ok((body.error?.message ?? '').length > 0);
}

describe('API error responses', () => {
  before(async () => {
    const { createApp } = (await import('../src/app')) as { createApp: () => Express };
    server = http.createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('answers an unknown API route with JSON, not an HTML error page', async () => {
    // Regression: Express's built-in 404 returns text/html, which the mobile
    // apps cannot parse — they reported it as "the server returned an invalid
    // response" and the real cause was invisible.
    const probe = await request('POST', '/api/v1/ride-dispatch/trips/abc/no-such-action', {
      token: tokenFor('driver-1'),
    });

    assertErrorEnvelope(probe, { status: 404, code: 'NOT_FOUND' });
    assert.doesNotMatch(probe.text, /<!DOCTYPE html>/i);
  });

  it('answers an unknown API route with JSON for unauthenticated callers too', async () => {
    const probe = await request('GET', '/api/v1/nope');
    assertErrorEnvelope(probe, { status: 404, code: 'NOT_FOUND' });
  });

  it('answers a missing token with the standard envelope', async () => {
    const probe = await request('POST', '/api/v1/ride-dispatch/trips/abc/release');
    assertErrorEnvelope(probe, { status: 401, code: 'UNAUTHORIZED' });
  });

  it('answers a wrong-role caller with the standard envelope', async () => {
    const probe = await request('POST', '/api/v1/ride-dispatch/trips/abc/release', {
      token: tokenFor('customer-1', 'CUSTOMER'),
    });
    assertErrorEnvelope(probe, { status: 403, code: 'FORBIDDEN' });
  });

  it('answers malformed JSON with a 400 envelope rather than a 500', async () => {
    const probe = await request('POST', '/api/v1/auth/login', { body: '{"identifier":' });
    assertErrorEnvelope(probe, { status: 400, code: 'BAD_REQUEST' });
  });

  it('rate limits per user and answers 429 as JSON with Retry-After', async () => {
    const token = tokenFor('rate-limited-driver');
    let limited: Probe | null = null;
    // RATE_LIMIT_MAX is 4 for this suite; the 5th request must be refused.
    for (let attempt = 0; attempt < 6 && !limited; attempt += 1) {
      const probe = await request('GET', '/api/v1/nope', { token });
      if (probe.status === 429) limited = probe;
    }

    assert.ok(limited, 'expected the limiter to refuse a request');
    assertErrorEnvelope(limited, { status: 429, code: 'RATE_LIMITED' });
    assert.ok(Number(limited.retryAfter) > 0, 'expected a Retry-After header');
  });

  it('does not let one user exhaust another user s budget', async () => {
    // The previous test burned through one driver's whole window. A different
    // signed-in user must be unaffected — before the fix every caller shared a
    // single bucket keyed on the hosting proxy's IP.
    const probe = await request('GET', '/api/v1/nope', { token: tokenFor('unrelated-driver') });
    assert.notEqual(probe.status, 429);
    assertErrorEnvelope(probe, { status: 404, code: 'NOT_FOUND' });
  });

  it('trusts the proxy so anonymous callers are keyed by real client IP', async () => {
    const { createApp } = (await import('../src/app')) as { createApp: () => Express };
    const app = createApp();
    assert.equal(app.get('trust proxy'), 1);
  });
});
