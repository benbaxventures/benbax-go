import { RideTripStatus } from '@prisma/client';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it, mock } from 'node:test';

// Set before the module graph loads: dotenv is pointed at a file that does not
// exist so the real apps/api/.env (production credentials) can never be read,
// and the database is replaced outright by the in-memory fake below.
process.env.DOTENV_CONFIG_PATH = 'tests/.env.does-not-exist';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:59999/benbax_test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-must-be-at-least-24-chars';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-must-be-at-least-24-chars';
delete process.env.REDIS_URL;

import jwt from 'jsonwebtoken';
import { asPrismaClient, createFakeRideDb, makeTrip, type FakeRideDb } from './helpers/fakeRideDb';

const DRIVER_USER_ID = 'driver-user-1';
const DRIVER_PROFILE_ID = 'driver-profile-1';

let server: http.Server;
let baseUrl: string;
let db: FakeRideDb;
let tripId: string;

function driverToken(userId = DRIVER_USER_ID) {
  return jwt.sign({ sub: userId, role: 'DRIVER' }, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: '5m',
  });
}

async function release(id = tripId, token = driverToken()) {
  const response = await fetch(`${baseUrl}/api/v1/ride-dispatch/trips/${id}/release`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  let body: unknown = null;
  let parsedAsJson = true;
  try {
    body = JSON.parse(text);
  } catch {
    parsedAsJson = false;
  }
  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    body,
    text,
    parsedAsJson,
  };
}

/** Puts the fake database back to "this driver is on an assigned trip". */
function seed(tripStatus: RideTripStatus = RideTripStatus.ASSIGNED) {
  const trip = makeTrip({ id: 'trip-under-test', status: tripStatus });
  tripId = trip.id;
  const fake = createFakeRideDb({
    trips: [trip],
    drivers: [{ id: DRIVER_PROFILE_ID, userId: DRIVER_USER_ID, status: 'ON_TRIP' }],
    assignments: [
      {
        id: 'assignment-1',
        tripId: trip.id,
        driverProfileId: DRIVER_PROFILE_ID,
        status: 'ACCEPTED',
        offeredAt: new Date(),
      },
    ],
  });
  // Re-point the live fake the mocked module already handed to the app.
  db.trips.clear();
  db.trips.set(trip.id, trip);
  db.assignments.length = 0;
  db.assignments.push(...fake.assignments);
  db.drivers.length = 0;
  db.drivers.push(...fake.drivers);
  db.onBeforeTripUpdate = undefined;
}

describe('POST /ride-dispatch/trips/:id/release', () => {
  before(async () => {
    db = createFakeRideDb({});
    // `exports` is the current option name; the installed @types/node still
    // only declares the deprecated `namedExports`, hence the cast.
    mock.module('../src/config/prisma', {
      exports: { prisma: asPrismaClient(db) },
    } as unknown as Parameters<typeof mock.module>[1]);

    const { createApp } = (await import('../src/app')) as { createApp: () => http.RequestListener };
    server = http.createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('releases the trip and answers with the success envelope', async () => {
    seed();

    const result = await release();

    assert.equal(result.status, 200, result.text);
    assert.ok(result.parsedAsJson, `expected JSON, got: ${result.text.slice(0, 160)}`);
    assert.match(result.contentType ?? '', /application\/json/);
    const body = result.body as {
      ok: boolean;
      data: { released: boolean; alreadyReleased: boolean; trip: { id: string; status: string } };
    };
    assert.equal(body.ok, true);
    assert.equal(body.data.released, true);
    assert.equal(body.data.alreadyReleased, false);
    assert.equal(body.data.trip.id, tripId);
    assert.equal(body.data.trip.status, RideTripStatus.REQUESTED);

    // And the state the driver's app depends on really moved.
    assert.equal(db.trips.get(tripId)?.status, RideTripStatus.REQUESTED);
    assert.equal(db.assignments[0]?.status, 'REJECTED');
    assert.equal(db.drivers[0]?.status, 'ACTIVE');
  });

  it('answers a repeat of the same release with success, not 403', async () => {
    seed();

    const first = await release();
    const second = await release();

    assert.equal(first.status, 200);
    assert.equal(second.status, 200, second.text);
    const body = second.body as {
      ok: boolean;
      data: { released: boolean; alreadyReleased: boolean };
    };
    assert.equal(body.ok, true);
    assert.equal(body.data.released, false);
    assert.equal(body.data.alreadyReleased, true);
  });

  it('refuses to release a trip that is already under way, with a named code', async () => {
    seed(RideTripStatus.IN_PROGRESS);

    const result = await release();

    assert.equal(result.status, 409);
    const body = result.body as { ok: boolean; error: { code: string; message: string } };
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'RIDE_NOT_RELEASABLE');
    assert.match(body.error.message, /already started/i);
    assert.equal(db.trips.get(tripId)?.status, RideTripStatus.IN_PROGRESS);
  });

  it('refuses a driver who is not on this trip', async () => {
    seed();
    // A real driver, just not this trip's driver.
    db.drivers.push({ id: 'driver-profile-2', userId: 'other-driver', status: 'ACTIVE' });

    const result = await release(tripId, driverToken('other-driver'));

    assert.equal(result.status, 403);
    const body = result.body as { ok: boolean; error: { code: string; message: string } };
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'FORBIDDEN');
    assert.match(body.error.message, /not the driver assigned/i);
    // The real driver keeps the trip.
    assert.equal(db.trips.get(tripId)?.status, RideTripStatus.ASSIGNED);
    assert.equal(db.assignments[0]?.status, 'ACCEPTED');
  });

  it('404s a caller with no driver profile at all', async () => {
    seed();

    const result = await release(tripId, driverToken('ghost-driver'));

    assert.equal(result.status, 404);
    const body = result.body as { ok: boolean; error: { code: string; message: string } };
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.match(body.error.message, /driver profile/i);
  });

  it('404s a trip that does not exist, in JSON', async () => {
    seed();

    const result = await release('no-such-trip');

    assert.equal(result.status, 404);
    assert.ok(result.parsedAsJson);
    const body = result.body as { ok: boolean; error: { code: string; message: string } };
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.match(body.error.message, /ride trip/i);
  });

  it('reports a database failure as a 503 envelope, never as a false success', async () => {
    seed();
    const workingTransaction = db.$transaction;
    db.$transaction = (async () => {
      const error = new Error("Can't reach database server at `db:5432`");
      error.name = 'PrismaClientInitializationError';
      throw error;
    }) as typeof db.$transaction;

    try {
      const result = await release();

      assert.equal(result.status, 503);
      const body = result.body as { ok: boolean; error: { code: string; message: string } };
      assert.equal(body.ok, false);
      assert.equal(body.error.code, 'DATABASE_UNAVAILABLE');
      // The connection string must not reach the driver's screen.
      assert.doesNotMatch(body.error.message, /db:5432|prisma/i);
      assert.equal(db.trips.get(tripId)?.status, RideTripStatus.ASSIGNED);
    } finally {
      db.$transaction = workingTransaction;
    }
  });
});
