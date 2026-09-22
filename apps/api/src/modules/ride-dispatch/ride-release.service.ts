import type { PrismaClient, RideTrip } from '@prisma/client';
import { RideTripStatus } from '@prisma/client';
import type { Server } from 'socket.io';
import { prisma as defaultPrisma } from '../../config/prisma';
import { realtimeEvents } from '../../realtime/events';
import { conflict, forbidden, notFound } from '../../utils/http';
import { clearRideDispatchState, dispatchRide } from '../dispatch/dispatch.service';
import { notify } from '../notifications/notify';
import { recordTripStatusEvent } from '../orders/status-events';
import { broadcastOpenRideRequest } from './ride-marketplace';

/**
 * Releasing a ride: the assigned driver can't make it, so the trip goes back
 * to the open pool and the passenger is matched again rather than cancelled.
 *
 * The rules this has to respect, because the driver's app is on a phone with
 * a flaky connection and will retry:
 *
 *  - It is idempotent. A second release of a ride this driver has already
 *    handed back is a success, not a 403 — otherwise a retry after a timeout
 *    (where the first attempt actually landed) leaves the app stuck showing
 *    "Trip in progress" with no way out.
 *  - It never releases twice. The trip only moves when this call is the one
 *    that flips it out of a driver-held status, so a duplicate request cannot
 *    re-open a ride another driver has since accepted, and the re-dispatch
 *    side effects run exactly once.
 *  - Every refusal is a specific, named error, so the app can tell "not your
 *    ride" from "already started" from "it's gone".
 */

/** Trip statuses a committed driver can still hand back. */
const RELEASABLE_STATUSES: RideTripStatus[] = [
  RideTripStatus.ASSIGNED,
  RideTripStatus.DRIVER_ARRIVING,
  RideTripStatus.ARRIVED,
];

/** The slice of the Prisma client this service touches. */
export type ReleaseRideDb = Pick<
  PrismaClient,
  'rideTrip' | 'rideAssignment' | 'driverProfile' | '$transaction'
>;

/** Everything that happens outside the database once a release commits. */
export type ReleaseRideEffects = {
  recordStatusEvent: typeof recordTripStatusEvent;
  broadcastOpenRequest: typeof broadcastOpenRideRequest;
  clearDispatchState: typeof clearRideDispatchState;
  redispatch: typeof dispatchRide;
  notifyPassenger: typeof notify;
};

export type ReleaseRideInput = {
  tripId: string;
  driverUserId: string;
  db?: ReleaseRideDb;
  io?: Server;
  effects?: Partial<ReleaseRideEffects>;
};

export type ReleaseRideResult = {
  /** The trip as it stands after this call. */
  trip: RideTrip;
  /** True when this call is the one that put the ride back in the pool. */
  released: boolean;
  /** True when the driver had already released it — a safe repeat. */
  alreadyReleased: boolean;
};

const defaultEffects: ReleaseRideEffects = {
  recordStatusEvent: recordTripStatusEvent,
  broadcastOpenRequest: broadcastOpenRideRequest,
  clearDispatchState: clearRideDispatchState,
  redispatch: dispatchRide,
  notifyPassenger: notify,
};

/** A trip in one of these has moved past the point of being handed back. */
function endedOrRunning(status: RideTripStatus) {
  return status === RideTripStatus.IN_PROGRESS || status === RideTripStatus.COMPLETED;
}

function notReleasable(status: RideTripStatus) {
  return conflict(
    status === RideTripStatus.IN_PROGRESS
      ? 'This trip has already started. End the trip instead of releasing it.'
      : 'This ride has already ended and can no longer be released.',
    'RIDE_NOT_RELEASABLE',
    { status }
  );
}

export async function releaseRide(input: ReleaseRideInput): Promise<ReleaseRideResult> {
  const db = input.db ?? defaultPrisma;
  const effects = { ...defaultEffects, ...input.effects };
  const { tripId, driverUserId, io } = input;

  const driver = await db.driverProfile.findUnique({
    where: { userId: driverUserId },
    select: { id: true },
  });
  if (!driver) throw notFound('Driver profile not found');

  const trip = await db.rideTrip.findUnique({ where: { id: tripId } });
  if (!trip) throw notFound('Ride trip not found');

  // The driver's most recent assignment for this trip, whatever state it is
  // in. Filtering to ACCEPTED here is what used to make a repeat release look
  // like an unauthorised one.
  const assignment = await db.rideAssignment.findFirst({
    where: { tripId, driverProfileId: driver.id },
    orderBy: { offeredAt: 'desc' },
    select: { id: true, status: true },
  });

  if (!assignment) {
    throw forbidden('You are not the driver assigned to this ride');
  }

  if (assignment.status === 'OFFERED') {
    // A pending offer was never accepted, so there is nothing to hand back —
    // declining it is what /assignments/:id/reject is for.
    throw forbidden('You have not accepted this ride, so there is nothing to release');
  }

  if (assignment.status !== 'ACCEPTED') {
    // REJECTED, EXPIRED or COMPLETED: this driver is no longer committed to
    // the trip. A repeat of a release that already landed is a success — the
    // caller's goal is achieved — which is what makes the endpoint safe to
    // retry. Only a trip they actually finished is refused.
    if (assignment.status === 'COMPLETED') throw notReleasable(trip.status);
    return { trip, released: false, alreadyReleased: true };
  }

  if (!RELEASABLE_STATUSES.includes(trip.status)) throw notReleasable(trip.status);

  // The conditional update is the lock. If two release requests (or a release
  // racing the passenger's cancel) arrive together, exactly one sees count > 0
  // and runs the side effects; the other falls through to the re-read below.
  const released = await db.$transaction(async (tx) => {
    const reopened = await tx.rideTrip.updateMany({
      where: { id: tripId, status: { in: RELEASABLE_STATUSES } },
      data: { status: RideTripStatus.REQUESTED },
    });
    if (reopened.count === 0) return false;

    await tx.rideAssignment.updateMany({
      where: { id: assignment.id, status: 'ACCEPTED' },
      data: { status: 'REJECTED', respondedAt: new Date() },
    });
    await tx.driverProfile.update({ where: { id: driver.id }, data: { status: 'ACTIVE' } });
    return true;
  });

  const after = (await db.rideTrip.findUnique({ where: { id: tripId } })) ?? trip;

  if (!released) {
    // Somebody else changed the trip between our read and our write — the
    // passenger cancelled, or the driver started it from another device.
    // Report what is true rather than claiming a release that did not happen.
    if (endedOrRunning(after.status)) throw notReleasable(after.status);
    return { trip: after, released: false, alreadyReleased: true };
  }

  await runReleaseSideEffects({
    trip: after,
    previousStatus: trip.status,
    driverUserId,
    io,
    effects,
  });

  return { trip: after, released: true, alreadyReleased: false };
}

/**
 * Everything after the commit: the passenger's app, the ops dashboard, the
 * marketplace and the next driver. Best-effort by design — the ride is already
 * released, so a failure here must be logged, never turned into an error the
 * driver sees and never left as an unhandled rejection that ends the process.
 */
async function runReleaseSideEffects(args: {
  trip: RideTrip;
  previousStatus: RideTripStatus;
  driverUserId: string;
  io: Server | undefined;
  effects: ReleaseRideEffects;
}) {
  const { trip, previousStatus, driverUserId, io, effects } = args;
  const tripId = trip.id;

  try {
    await effects.recordStatusEvent(tripId, {
      fromStatus: previousStatus,
      toStatus: RideTripStatus.REQUESTED,
      actorId: driverUserId,
      note: 'Driver released the ride; finding another driver',
    });
  } catch (error) {
    console.error('[api] failed to record release status event', { tripId, error });
  }

  io?.to(`user:${trip.passengerId}`).emit(realtimeEvents.rideUpdated, trip);
  io?.to(`ride:${tripId}`).emit(realtimeEvents.rideUpdated, trip);
  io?.to('admins').emit(realtimeEvents.rideUpdated, trip);

  void effects
    .notifyPassenger(
      { userIds: [trip.passengerId], channels: ['inapp', 'push'] },
      {
        title: 'Finding you another driver',
        body: 'Your driver could not make it. We are matching you with another driver now.',
        data: { type: 'ride-released', tripId },
      }
    )
    .catch((error) => console.error('[api] release notification failed', { tripId, error }));

  effects.clearDispatchState(tripId);

  try {
    await effects.broadcastOpenRequest(io, tripId);
  } catch (error) {
    console.error('[api] failed to broadcast released ride', { tripId, error });
  }

  // Drivers whose offers were voided when this driver accepted are fair game
  // again right away. Fire-and-forget, but never unhandled.
  void effects
    .redispatch(tripId, io, { skipReofferCooldown: true })
    .catch((error) => console.error('[api] re-dispatch after release failed', { tripId, error }));
}
