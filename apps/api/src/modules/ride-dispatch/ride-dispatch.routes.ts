import { RideTripStatus, UserRole } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { requireAuth, requireRoles } from '../../middleware/auth';
import { realtimeEvents } from '../../realtime/events';
import { getOnlineDriver } from '../../realtime/presence';
import { asyncHandler } from '../../utils/asyncHandler';
import { badRequest, notFound } from '../../utils/http';
import { ok } from '../../utils/response';
import { dispatchRide } from '../dispatch/dispatch.service';
import {
  claimRide,
  findActiveRideForDriver,
  listOpenRideRequests,
  RIDE_ASSIGNMENT_INCLUDE,
  withDialablePhones,
} from './ride-marketplace';
import { releaseRide } from './ride-release.service';

export const rideDispatchRouter = Router();

rideDispatchRouter.use(requireAuth);

async function requireDriverProfile(userId: string) {
  const driver = await prisma.driverProfile.findUnique({
    where: { userId },
    select: { id: true, userId: true, currentLatitude: true, currentLongitude: true },
  });
  if (!driver) throw notFound('Driver profile not found');
  return driver;
}

rideDispatchRouter.post(
  '/trips/:id/assign',
  requireRoles(UserRole.ADMIN, UserRole.OPERATIONS),
  asyncHandler(async (req, res) => {
    const tripId = req.params.id;
    if (!tripId) throw badRequest('Trip id is required');

    const trip = await prisma.rideTrip.findUnique({ where: { id: tripId } });
    if (!trip) throw notFound('Ride trip not found');

    // Optional: operator picked a specific driver instead of "best available".
    const targetDriverProfileId =
      typeof req.body?.driverProfileId === 'string' && req.body.driverProfileId
        ? (req.body.driverProfileId as string)
        : undefined;

    // A manual assign replaces whatever offer is currently pending, and the
    // driver holding it is told so their Accept card disappears.
    const io = req.app.get('io');
    const pending = await prisma.rideAssignment.findMany({
      where: { tripId, status: 'OFFERED' },
      select: { id: true, driverProfile: { select: { userId: true } } },
    });
    if (pending.length) {
      await prisma.rideAssignment.updateMany({
        where: { id: { in: pending.map((p) => p.id) }, status: 'OFFERED' },
        data: { status: 'EXPIRED', respondedAt: new Date() },
      });
      for (const offer of pending) {
        io?.to(`driver:${offer.driverProfile.userId}`).emit(realtimeEvents.driverOfferExpired, {
          assignmentId: offer.id,
          tripId,
        });
      }
    }

    const assignment = await dispatchRide(tripId, io, {
      actorId: req.user!.id,
      skipReofferCooldown: true,
      ...(targetDriverProfileId ? { targetDriverProfileId } : {}),
    });
    if (!assignment) {
      throw badRequest(
        targetDriverProfileId
          ? 'That driver is not online and free right now'
          : 'No available drivers are online right now'
      );
    }

    return ok(res, { assignment });
  })
);

/**
 * Every ride request still waiting for a driver, nationwide. Drivers can
 * accept any of them with POST /trips/:id/claim.
 */
rideDispatchRouter.get(
  '/open-requests',
  requireRoles(UserRole.DRIVER),
  asyncHandler(async (req, res) => {
    const driver = await requireDriverProfile(req.user!.id);
    const presence = getOnlineDriver(driver.userId);
    const from = presence
      ? { latitude: presence.latitude, longitude: presence.longitude }
      : driver.currentLatitude != null && driver.currentLongitude != null
        ? { latitude: Number(driver.currentLatitude), longitude: Number(driver.currentLongitude) }
        : null;
    return ok(res, await listOpenRideRequests(from));
  })
);

/** Accept an open request directly from the marketplace list. */
rideDispatchRouter.post(
  '/trips/:id/claim',
  requireRoles(UserRole.DRIVER),
  asyncHandler(async (req, res) => {
    const tripId = req.params.id;
    if (!tripId) throw badRequest('Trip id is required');
    const assignment = await claimRide({
      tripId,
      driverUserId: req.user!.id,
      io: req.app.get('io'),
    });
    return ok(res, assignment);
  })
);

/**
 * What the driver should be looking at right now: an in-progress trip to
 * resume and/or a pending targeted offer. Lets the app recover after it was
 * backgrounded, restarted, or missed a socket event.
 */
rideDispatchRouter.get(
  '/me/current',
  requireRoles(UserRole.DRIVER),
  asyncHandler(async (req, res) => {
    const driver = await requireDriverProfile(req.user!.id);
    const [active, pendingOffer] = await Promise.all([
      findActiveRideForDriver(driver.id),
      prisma.rideAssignment.findFirst({
        where: {
          driverProfileId: driver.id,
          status: 'OFFERED',
          expiresAt: { gt: new Date() },
          trip: { status: { in: [RideTripStatus.REQUESTED, RideTripStatus.ASSIGNING] } },
        },
        orderBy: { offeredAt: 'desc' },
        include: RIDE_ASSIGNMENT_INCLUDE,
      }),
    ]);
    return ok(res, {
      activeTrip: active ? withDialablePhones(active) : null,
      pendingOffer,
    });
  })
);

rideDispatchRouter.post(
  '/assignments/:id/accept',
  requireRoles(UserRole.DRIVER),
  asyncHandler(async (req, res) => {
    const assignmentId = req.params.id;
    if (!assignmentId) throw badRequest('Assignment id is required');
    const driver = await requireDriverProfile(req.user!.id);

    // Status isn't filtered here: an offer that just timed out can still be
    // accepted as long as nobody else has taken the ride.
    const existing = await prisma.rideAssignment.findFirst({
      where: { id: assignmentId, driverProfileId: driver.id },
      select: { id: true, tripId: true },
    });
    if (!existing) throw notFound('Ride assignment not found');

    const assignment = await claimRide({
      tripId: existing.tripId,
      driverUserId: req.user!.id,
      assignmentId: existing.id,
      io: req.app.get('io'),
    });
    return ok(res, assignment);
  })
);

rideDispatchRouter.post(
  '/assignments/:id/reject',
  requireRoles(UserRole.DRIVER),
  asyncHandler(async (req, res) => {
    const assignmentId = req.params.id;
    if (!assignmentId) throw badRequest('Assignment id is required');
    const driver = await requireDriverProfile(req.user!.id);

    const existing = await prisma.rideAssignment.findFirst({
      where: { id: assignmentId, driverProfileId: driver.id },
      select: { id: true, tripId: true, status: true },
    });
    if (!existing) throw notFound('Ride assignment not found');

    const assignment =
      existing.status === 'OFFERED'
        ? await prisma.rideAssignment.update({
            where: { id: assignmentId },
            data: { status: 'REJECTED', respondedAt: new Date() },
          })
        : existing;

    // Hand the ride straight to the next driver instead of waiting for expiry.
    // Fire-and-forget, but never unhandled: an uncaught rejection here would
    // take the whole API process down with it.
    void dispatchRide(existing.tripId, req.app.get('io')).catch((error) =>
      console.error('[api] re-dispatch after reject failed', { tripId: existing.tripId, error })
    );
    return ok(res, assignment);
  })
);

/**
 * The assigned driver can't make it. Rather than cancelling on the passenger,
 * put the ride back in the open pool and find them another driver.
 *
 * Safe to retry: see releaseRide for how repeats and races are handled.
 */
rideDispatchRouter.post(
  '/trips/:id/release',
  requireRoles(UserRole.DRIVER),
  asyncHandler(async (req, res) => {
    const tripId = req.params.id;
    if (!tripId) throw badRequest('Trip id is required');

    const result = await releaseRide({
      tripId,
      driverUserId: req.user!.id,
      io: req.app.get('io'),
    });

    // `released` vs `alreadyReleased` is what lets the app tell "this call did
    // the work" from "a retry found it already done" — both are successes, and
    // both mean the driver is free.
    return ok(res, {
      trip: result.trip,
      released: result.released,
      alreadyReleased: result.alreadyReleased,
    });
  })
);
