import { RideTripStatus } from '@prisma/client';
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { ReleaseRideEffects } from '../src/modules/ride-dispatch/ride-release.service';
import { releaseRide } from '../src/modules/ride-dispatch/ride-release.service';
import { AppError } from '../src/utils/http';
import { createFakeRideDb, makeTrip, type FakeRideDb } from './helpers/fakeRideDb';

const DRIVER_USER_ID = 'driver-user-1';
const DRIVER_PROFILE_ID = 'driver-profile-1';

type EffectLog = {
  statusEvents: number;
  broadcasts: number;
  redispatches: number;
  notifications: number;
  cleared: string[];
};

function trackedEffects(log: EffectLog, overrides: Partial<ReleaseRideEffects> = {}) {
  return {
    recordStatusEvent: async () => {
      log.statusEvents += 1;
    },
    broadcastOpenRequest: async () => {
      log.broadcasts += 1;
    },
    clearDispatchState: (tripId: string) => {
      log.cleared.push(tripId);
    },
    redispatch: async () => {
      log.redispatches += 1;
      return null;
    },
    notifyPassenger: async () => {
      log.notifications += 1;
    },
    ...overrides,
  } as Partial<ReleaseRideEffects>;
}

/** Waits for the fire-and-forget effects (notify, re-dispatch) to settle. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function expectAppError(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof AppError, `expected an AppError, got ${String(error)}`);
    return error;
  }
  throw new Error('expected the call to reject, but it resolved');
}

describe('releaseRide', () => {
  let log: EffectLog;

  beforeEach(() => {
    log = { statusEvents: 0, broadcasts: 0, redispatches: 0, notifications: 0, cleared: [] };
  });

  function scenario(options: {
    tripStatus?: RideTripStatus;
    assignmentStatus?: 'OFFERED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
    withAssignment?: boolean;
    withDriver?: boolean;
  }) {
    const trip = makeTrip({ status: options.tripStatus ?? RideTripStatus.ASSIGNED });
    const db = createFakeRideDb({
      trips: [trip],
      drivers:
        options.withDriver === false
          ? []
          : [{ id: DRIVER_PROFILE_ID, userId: DRIVER_USER_ID, status: 'ON_TRIP' }],
      assignments:
        options.withAssignment === false
          ? []
          : [
              {
                id: 'assignment-1',
                tripId: trip.id,
                driverProfileId: DRIVER_PROFILE_ID,
                status: options.assignmentStatus ?? 'ACCEPTED',
                offeredAt: new Date(),
              },
            ],
    });
    return { trip, db };
  }

  const release = (db: FakeRideDb, tripId: string, driverUserId = DRIVER_USER_ID) =>
    releaseRide({ tripId, driverUserId, db, effects: trackedEffects(log) });

  it('releases an assigned ride back to the open pool', async () => {
    const { trip, db } = scenario({ tripStatus: RideTripStatus.ASSIGNED });

    const result = await release(db, trip.id);
    await flush();

    assert.equal(result.released, true);
    assert.equal(result.alreadyReleased, false);
    assert.equal(result.trip.status, RideTripStatus.REQUESTED);
    assert.equal(db.trips.get(trip.id)?.status, RideTripStatus.REQUESTED);
    assert.equal(db.assignments[0]?.status, 'REJECTED');
    // The driver is free to take other work again.
    assert.equal(db.drivers[0]?.status, 'ACTIVE');
    // And the passenger gets matched again rather than left stranded.
    assert.equal(log.statusEvents, 1);
    assert.equal(log.notifications, 1);
    assert.equal(log.broadcasts, 1);
    assert.equal(log.redispatches, 1);
    assert.deepEqual(log.cleared, [trip.id]);
  });

  it('releases a ride the driver has already arrived for', async () => {
    const { trip, db } = scenario({ tripStatus: RideTripStatus.ARRIVED });

    const result = await release(db, trip.id);

    assert.equal(result.released, true);
    assert.equal(db.trips.get(trip.id)?.status, RideTripStatus.REQUESTED);
  });

  it('is idempotent: a repeated release succeeds without re-releasing', async () => {
    const { trip, db } = scenario({ tripStatus: RideTripStatus.ASSIGNED });

    const first = await release(db, trip.id);
    await flush();
    const second = await release(db, trip.id);
    await flush();

    assert.equal(first.released, true);
    assert.equal(second.released, false);
    assert.equal(second.alreadyReleased, true);
    assert.equal(second.trip.status, RideTripStatus.REQUESTED);
    // The side effects ran exactly once: no duplicate re-dispatch storm, no
    // second "finding you another driver" push to the passenger.
    assert.equal(log.redispatches, 1);
    assert.equal(log.notifications, 1);
    assert.equal(log.statusEvents, 1);
  });

  it('reports success when another driver has since taken the released ride', async () => {
    const { trip, db } = scenario({ tripStatus: RideTripStatus.ASSIGNED });
    await release(db, trip.id);
    await flush();
    // Someone else accepted it in the meantime.
    db.trips.set(trip.id, { ...db.trips.get(trip.id)!, status: RideTripStatus.ASSIGNED });

    const retry = await release(db, trip.id);

    assert.equal(retry.released, false);
    assert.equal(retry.alreadyReleased, true);
    assert.equal(log.redispatches, 1);
  });

  it('rejects a release from a driver who was never assigned to the ride', async () => {
    const { trip, db } = scenario({ withAssignment: false });

    const error = await expectAppError(() => release(db, trip.id));

    assert.equal(error.statusCode, 403);
    assert.equal(error.code, 'FORBIDDEN');
    assert.equal(db.trips.get(trip.id)?.status, RideTripStatus.ASSIGNED);
    assert.equal(log.redispatches, 0);
  });

  it('rejects a release of an offer the driver never accepted', async () => {
    const { trip, db } = scenario({ assignmentStatus: 'OFFERED' });

    const error = await expectAppError(() => release(db, trip.id));

    assert.equal(error.statusCode, 403);
    assert.match(error.message, /not accepted/i);
  });

  it('refuses to release a trip that is already in progress', async () => {
    const { trip, db } = scenario({ tripStatus: RideTripStatus.IN_PROGRESS });

    const error = await expectAppError(() => release(db, trip.id));

    assert.equal(error.statusCode, 409);
    assert.equal(error.code, 'RIDE_NOT_RELEASABLE');
    assert.match(error.message, /already started/i);
    assert.equal(db.trips.get(trip.id)?.status, RideTripStatus.IN_PROGRESS);
  });

  it('refuses to release a completed trip', async () => {
    const { trip, db } = scenario({ tripStatus: RideTripStatus.COMPLETED });

    const error = await expectAppError(() => release(db, trip.id));

    assert.equal(error.statusCode, 409);
    assert.equal(error.code, 'RIDE_NOT_RELEASABLE');
    assert.match(error.message, /already ended/i);
  });

  it('treats a cancelled trip the driver already let go as already released', async () => {
    const { trip, db } = scenario({
      tripStatus: RideTripStatus.CANCELLED,
      assignmentStatus: 'REJECTED',
    });

    const result = await release(db, trip.id);

    assert.equal(result.released, false);
    assert.equal(result.alreadyReleased, true);
  });

  it('404s for a trip that does not exist', async () => {
    const { db } = scenario({});

    const error = await expectAppError(() => release(db, 'no-such-trip'));

    assert.equal(error.statusCode, 404);
    assert.equal(error.code, 'NOT_FOUND');
  });

  it('404s when the caller has no driver profile', async () => {
    const { trip, db } = scenario({ withDriver: false });

    const error = await expectAppError(() => release(db, trip.id));

    assert.equal(error.statusCode, 404);
    assert.match(error.message, /driver profile/i);
  });

  it('surfaces a database failure as an error instead of a false success', async () => {
    const { trip, db } = scenario({});
    db.$transaction = async () => {
      throw new Error('Can not reach database server at db:5432');
    };

    await assert.rejects(() => release(db, trip.id), /reach database server/);
    // Nothing was announced to passengers or other drivers.
    assert.equal(log.redispatches, 0);
    assert.equal(log.broadcasts, 0);
  });

  it('does not double-release when the passenger cancels mid-request', async () => {
    const { trip, db } = scenario({ tripStatus: RideTripStatus.ASSIGNED });
    // The trip is cancelled between the service's read and its conditional
    // write, so the write matches nothing.
    db.onBeforeTripUpdate = () => {
      db.trips.set(trip.id, { ...db.trips.get(trip.id)!, status: RideTripStatus.CANCELLED });
    };

    const result = await release(db, trip.id);

    assert.equal(result.released, false);
    assert.equal(result.alreadyReleased, true);
    assert.equal(db.trips.get(trip.id)?.status, RideTripStatus.CANCELLED);
    assert.equal(log.redispatches, 0);
  });

  it('reports a conflict when the trip starts mid-request', async () => {
    const { trip, db } = scenario({ tripStatus: RideTripStatus.ARRIVED });
    db.onBeforeTripUpdate = () => {
      db.trips.set(trip.id, { ...db.trips.get(trip.id)!, status: RideTripStatus.IN_PROGRESS });
    };

    const error = await expectAppError(() => release(db, trip.id));

    assert.equal(error.statusCode, 409);
    assert.equal(error.code, 'RIDE_NOT_RELEASABLE');
  });

  it('still releases when the passenger notification fails', async () => {
    const { trip, db } = scenario({});

    const result = await releaseRide({
      tripId: trip.id,
      driverUserId: DRIVER_USER_ID,
      db,
      effects: trackedEffects(log, {
        notifyPassenger: async () => {
          throw new Error('push gateway down');
        },
      }),
    });
    await flush();

    assert.equal(result.released, true);
    assert.equal(db.trips.get(trip.id)?.status, RideTripStatus.REQUESTED);
  });
});
