import { CancelActor, Prisma, RideTripStatus, type RideTrip } from '@prisma/client';
import type { Server } from 'socket.io';
import { prisma } from '../../config/prisma';
import { realtimeEvents } from '../../realtime/events';
import { getOnlineDriver } from '../../realtime/presence';
import { notify } from '../notifications/notify';
import { recordDeliveryStatusEvent, recordTripStatusEvent } from '../orders/status-events';
import {
  broadcastRideRequestClosed,
  OPEN_REQUEST_MAX_AGE_MS,
  OPEN_RIDE_STATUSES,
  RIDE_ASSIGNMENT_INCLUDE,
  type RideAssignmentPayload,
} from '../ride-dispatch/ride-marketplace';
import { rankRiders } from './dispatch.engine';

/** How long the targeted driver has to answer before the offer moves on. */
export const RIDE_OFFER_TTL_MS = 30_000;
/** Driver positions older than this are too stale to dispatch against. */
const DRIVER_LOCATION_STALE_MS = 3 * 60 * 1000;
/** Minimum gap between automatic re-dispatch attempts for the same trip. */
const REDISPATCH_INTERVAL_MS = 20_000;
/**
 * A driver who let an offer lapse (didn't see it in time) is offered the same
 * ride again after this long, once nobody new is available. Drivers who
 * explicitly declined are never re-offered.
 */
const REOFFER_COOLDOWN_MS = 60_000;
/** How often the sweeper expires offers and retries waiting rides. */
const SWEEP_INTERVAL_MS = 10_000;
/** Only rides requested this recently are auto-closed; older rows are left alone. */
const AUTO_CLOSE_LOOKBACK_MS = 6 * 60 * 60 * 1000;

const dispatchInFlight = new Set<string>();
const lastDispatchAttempt = new Map<string, number>();
const noDriverNotified = new Set<string>();

type DispatchOptions = {
  actorId?: string;
  /** Re-offer to drivers whose earlier offer lapsed without waiting out the cooldown. */
  skipReofferCooldown?: boolean;
  /** Operator picked a specific driver: offer only to them (if online and free). */
  targetDriverProfileId?: string;
};

/**
 * Offers a waiting ride to the best available driver who hasn't been asked yet.
 *
 * There is no distance cut-off: every online driver nationwide is a candidate,
 * ranked nearest/best first. Only one targeted offer is live at a time; when it
 * is rejected or times out the sweeper calls this again for the next driver.
 * Meanwhile the ride stays in the open marketplace so any driver can accept it.
 */
export async function dispatchRide(
  tripId: string,
  io?: Server,
  options: DispatchOptions = {}
): Promise<RideAssignmentPayload | null> {
  if (dispatchInFlight.has(tripId)) return null;
  dispatchInFlight.add(tripId);
  lastDispatchAttempt.set(tripId, Date.now());
  try {
    return await offerRideToNextDriver(tripId, io, options);
  } finally {
    dispatchInFlight.delete(tripId);
  }
}

async function offerRideToNextDriver(
  tripId: string,
  io: Server | undefined,
  options: DispatchOptions
): Promise<RideAssignmentPayload | null> {
  const trip = await prisma.rideTrip.findUnique({ where: { id: tripId } });
  if (!trip || !OPEN_RIDE_STATUSES.includes(trip.status)) {
    lastDispatchAttempt.delete(tripId);
    noDriverNotified.delete(tripId);
    return null;
  }
  if (trip.scheduledFor && trip.scheduledFor.getTime() > Date.now()) return null;

  const now = Date.now();
  const previous = await prisma.rideAssignment.findMany({
    where: { tripId },
    select: { driverProfileId: true, status: true, expiresAt: true, offeredAt: true },
  });
  if (previous.some((a) => a.status === 'OFFERED' && a.expiresAt.getTime() > now)) return null;

  // Declined (or released) → never ask again. Lapsed → may ask again later.
  const declined = [
    ...new Set(previous.filter((a) => a.status === 'REJECTED').map((a) => a.driverProfileId)),
  ];
  const lastOfferedAt = new Map<string, number>();
  for (const a of previous) {
    if (a.status === 'REJECTED') continue;
    const at = a.offeredAt.getTime();
    lastOfferedAt.set(a.driverProfileId, Math.max(lastOfferedAt.get(a.driverProfileId) ?? 0, at));
  }

  const drivers = await prisma.driverProfile.findMany({
    where: {
      isOnline: true,
      status: 'ACTIVE',
      currentLatitude: { not: null },
      currentLongitude: { not: null },
      lastLocationAt: { gte: new Date(now - DRIVER_LOCATION_STALE_MS) },
      ...(options.targetDriverProfileId
        ? { id: options.targetDriverProfileId }
        : declined.length
          ? { id: { notIn: declined } }
          : {}),
    },
    select: {
      id: true,
      userId: true,
      rating: true,
      currentLatitude: true,
      currentLongitude: true,
      lastLocationAt: true,
    },
  });

  if (drivers.length === 0) {
    if (options.targetDriverProfileId) return null; // chosen driver not available
    if (!noDriverNotified.has(trip.id)) {
      noDriverNotified.add(trip.id);
      const noDriverUpdate = { ...trip, dispatchStatus: 'NO_AVAILABLE_DRIVERS' };
      io?.to(`user:${trip.passengerId}`).emit(realtimeEvents.rideUpdated, noDriverUpdate);
      io?.to(`ride:${trip.id}`).emit(realtimeEvents.rideUpdated, noDriverUpdate);
    }
    return null;
  }
  noDriverNotified.delete(trip.id);

  // Only consider drivers with a live connection when there are any: they get
  // the offer instantly. The DB flag alone can be stale if the app was killed
  // without going offline, and offering to a ghost wastes the passenger's time.
  const live = drivers.filter((driver) => getOnlineDriver(driver.userId));
  const reachable = live.length > 0 || options.targetDriverProfileId ? live : drivers;
  if (options.targetDriverProfileId) {
    // An operator's explicit pick skips the declined/cooldown rules, but the
    // driver must actually be connected to receive it.
    return reachable.length ? createRideOffer(trip, reachable[0]!, now, io, options) : null;
  }

  // Drivers not yet asked come first; then anyone whose offer lapsed a while
  // ago, so a lone driver who missed the alert keeps getting nudged.
  const fresh = reachable.filter((driver) => !lastOfferedAt.has(driver.id));
  const retry = reachable.filter((driver) => {
    const at = lastOfferedAt.get(driver.id);
    return at != null && (options.skipReofferCooldown || now - at >= REOFFER_COOLDOWN_MS);
  });
  const pool = fresh.length > 0 ? fresh : retry;
  if (pool.length === 0) return null; // everyone is cooling down; retry later

  const ranked = rankRiders(
    { latitude: Number(trip.pickupLatitude), longitude: Number(trip.pickupLongitude) },
    pool.map((driver) => {
      const presence = getOnlineDriver(driver.userId);
      const lastSeen = presence?.lastSeenAt ?? driver.lastLocationAt?.getTime() ?? now - 300_000;
      return {
        id: driver.id,
        latitude: presence?.latitude ?? Number(driver.currentLatitude),
        longitude: presence?.longitude ?? Number(driver.currentLongitude),
        rating: Number(driver.rating),
        activeDeliveries: 0,
        lastLocationAgeSeconds: Math.max(0, Math.floor((now - lastSeen) / 1000)),
      };
    })
  );

  const best = ranked[0];
  if (!best) return null;

  return createRideOffer(trip, { id: best.riderId, score: best.score }, now, io, options);
}

/** Creates a time-boxed offer for one driver and alerts them, the passenger and ops. */
async function createRideOffer(
  trip: RideTrip,
  driver: { id: string; score?: number },
  now: number,
  io: Server | undefined,
  options: DispatchOptions
): Promise<RideAssignmentPayload> {
  const assignment = await prisma.rideAssignment.create({
    data: {
      tripId: trip.id,
      driverProfileId: driver.id,
      score: new Prisma.Decimal(driver.score ?? 0),
      expiresAt: new Date(now + RIDE_OFFER_TTL_MS),
    },
    include: RIDE_ASSIGNMENT_INCLUDE,
  });

  const updatedTrip =
    trip.status === RideTripStatus.ASSIGNING
      ? trip
      : await prisma.rideTrip.update({
          where: { id: trip.id },
          data: { status: RideTripStatus.ASSIGNING },
        });

  if (trip.status !== RideTripStatus.ASSIGNING) {
    await recordTripStatusEvent(trip.id, {
      fromStatus: trip.status,
      toStatus: RideTripStatus.ASSIGNING,
      actorId: options.actorId ?? null,
      note: `Offered to ${assignment.driverProfile.user.name}`,
    });
  }

  io?.to(`driver:${assignment.driverProfile.userId}`).emit(realtimeEvents.driverOffer, assignment);
  io?.to(`user:${trip.passengerId}`).emit(realtimeEvents.rideAssigned, assignment);
  io?.to(`ride:${trip.id}`).emit(realtimeEvents.rideAssigned, assignment);
  io?.to(`user:${trip.passengerId}`).emit(realtimeEvents.rideUpdated, updatedTrip);
  io?.to(`ride:${trip.id}`).emit(realtimeEvents.rideUpdated, updatedTrip);
  io?.to('admins').emit(realtimeEvents.rideAssigned, assignment);

  // Alert the offered driver even with the app backgrounded: in-app + push, plus
  // WhatsApp/SMS when those gateways are configured (1:1, so never spammy).
  void notify(
    { userIds: [assignment.driverProfile.userId], channels: ['inapp', 'push', 'whatsapp', 'sms'] },
    {
      title: 'New ride request',
      body: `A passenger at ${trip.pickupLabel} is waiting. Open the app to accept.`,
      data: { type: 'ride-offer', assignmentId: assignment.id, tripId: trip.id },
    }
  );

  return assignment;
}

/**
 * Marks targeted offers the driver never answered as EXPIRED, tells that
 * driver, and moves each ride on to the next candidate.
 */
async function expireOverdueRideOffers(io?: Server) {
  const overdue = await prisma.rideAssignment.findMany({
    where: { status: 'OFFERED', expiresAt: { lt: new Date() } },
    select: { id: true, tripId: true, driverProfile: { select: { userId: true } } },
    take: 100,
  });

  const tripIds = new Set<string>();
  for (const offer of overdue) {
    const expired = await prisma.rideAssignment.updateMany({
      where: { id: offer.id, status: 'OFFERED' },
      data: { status: 'EXPIRED', respondedAt: new Date() },
    });
    if (expired.count === 0) continue;
    io?.to(`driver:${offer.driverProfile.userId}`).emit(realtimeEvents.driverOfferExpired, {
      assignmentId: offer.id,
      tripId: offer.tripId,
    });
    tripIds.add(offer.tripId);
  }

  for (const tripId of tripIds) {
    await dispatchRide(tripId, io);
  }
}

/**
 * Retries rides that are still waiting with no live offer — e.g. every driver
 * declined, none were online at request time, or the API restarted and lost
 * its in-memory state. New drivers coming online get picked up here.
 */
async function redispatchWaitingRides(io?: Server) {
  const now = Date.now();
  const oldest = new Date(now - OPEN_REQUEST_MAX_AGE_MS);
  const waiting = await prisma.rideTrip.findMany({
    where: {
      status: { in: OPEN_RIDE_STATUSES },
      OR: [
        { scheduledFor: null, createdAt: { gte: oldest } },
        { scheduledFor: { gte: oldest, lte: new Date(now) } },
      ],
      assignments: { none: { status: 'OFFERED', expiresAt: { gt: new Date(now) } } },
    },
    select: { id: true },
    take: 50,
  });

  for (const { id } of waiting) {
    const last = lastDispatchAttempt.get(id) ?? 0;
    if (now - last < REDISPATCH_INTERVAL_MS) continue;
    await dispatchRide(id, io);
  }
}

/**
 * Closes recent requests nobody accepted within OPEN_REQUEST_MAX_AGE_MS so the
 * passenger isn't left waiting on a ride that will never come.
 */
async function closeUnclaimedRideRequests(io?: Server) {
  const now = Date.now();
  const cutoff = new Date(now - OPEN_REQUEST_MAX_AGE_MS);
  const lookback = new Date(now - AUTO_CLOSE_LOOKBACK_MS);
  const stale = await prisma.rideTrip.findMany({
    where: {
      status: { in: OPEN_RIDE_STATUSES },
      OR: [
        { scheduledFor: null, createdAt: { lt: cutoff, gte: lookback } },
        { scheduledFor: { lt: cutoff, gte: lookback } },
      ],
    },
    select: { id: true, status: true, passengerId: true },
    take: 50,
  });

  for (const trip of stale) {
    const closed = await prisma.rideTrip.updateMany({
      where: { id: trip.id, status: { in: OPEN_RIDE_STATUSES } },
      data: {
        status: RideTripStatus.CANCELLED,
        cancelledBy: CancelActor.SYSTEM,
        cancellationReason: 'No driver accepted the request in time',
      },
    });
    if (closed.count === 0) continue;
    await prisma.rideAssignment.updateMany({
      where: { tripId: trip.id, status: 'OFFERED' },
      data: { status: 'EXPIRED', respondedAt: new Date() },
    });
    await recordTripStatusEvent(trip.id, {
      fromStatus: trip.status,
      toStatus: RideTripStatus.CANCELLED,
      note: 'Closed automatically: no driver accepted in time',
    });
    const updated = await prisma.rideTrip.findUnique({ where: { id: trip.id } });
    io?.to(`user:${trip.passengerId}`).emit(realtimeEvents.rideUpdated, updated);
    io?.to(`ride:${trip.id}`).emit(realtimeEvents.rideUpdated, updated);
    broadcastRideRequestClosed(io, trip.id, 'expired');
    lastDispatchAttempt.delete(trip.id);
    noDriverNotified.delete(trip.id);
  }
}

/** Forget in-memory dispatch state for a ride that left the open pool. */
export function clearRideDispatchState(tripId: string) {
  lastDispatchAttempt.delete(tripId);
  noDriverNotified.delete(tripId);
}

let sweeperTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Background loop that keeps ride dispatch moving without relying on
 * per-request timers (which would be lost on restart).
 */
export function startRideDispatchSweeper(io: Server) {
  if (sweeperTimer) return;
  let running = false;
  sweeperTimer = setInterval(() => {
    if (running) return;
    running = true;
    (async () => {
      await expireOverdueRideOffers(io);
      await redispatchWaitingRides(io);
      await closeUnclaimedRideRequests(io);
    })()
      .catch((error) => console.error('Ride dispatch sweep failed', error))
      .finally(() => {
        running = false;
      });
  }, SWEEP_INTERVAL_MS);
  sweeperTimer.unref?.();
}

export async function dispatchDelivery(deliveryId: string, io?: Server) {
  const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } });
  if (!delivery) return;

  const riders = await prisma.riderProfile.findMany({
    where: {
      isOnline: true,
      status: 'ACTIVE',
      currentLatitude: { not: null },
      currentLongitude: { not: null },
    },
    take: 25,
  });

  if (!riders.length) return;

  const ranked = rankRiders(
    {
      latitude: Number(delivery.pickupLatitude),
      longitude: Number(delivery.pickupLongitude),
    },
    riders.map((rider) => ({
      id: rider.id,
      latitude: Number(rider.currentLatitude),
      longitude: Number(rider.currentLongitude),
      rating: Number(rider.rating),
      activeDeliveries: rider.status === 'ON_DELIVERY' ? 1 : 0,
      lastLocationAgeSeconds: rider.lastLocationAt
        ? Math.floor((Date.now() - rider.lastLocationAt.getTime()) / 1000)
        : 300,
    }))
  );

  const best = ranked[0];
  if (!best) return;

  const assignment = await prisma.deliveryAssignment.create({
    data: {
      deliveryId: delivery.id,
      riderProfileId: best.riderId,
      score: new Prisma.Decimal(best.score),
      expiresAt: new Date(Date.now() + 45_000),
    },
    include: {
      riderProfile: { include: { user: true } },
      delivery: {
        include: {
          customer: { select: { id: true, name: true, phone: true } },
        },
      },
    },
  });

  await prisma.delivery.update({
    where: { id: delivery.id },
    data: { status: 'ASSIGNING' },
  });

  await recordDeliveryStatusEvent(delivery.id, {
    fromStatus: delivery.status,
    toStatus: 'ASSIGNING',
    note: `Offered to ${assignment.riderProfile.user.name}`,
  });

  io?.to(`rider:${assignment.riderProfile.userId}`).emit(realtimeEvents.riderOffer, assignment);
  io?.to('admins').emit(realtimeEvents.deliveryAssigned, assignment);

  // Alert the offered rider even with the app backgrounded: in-app + push, plus
  // WhatsApp/SMS when those gateways are configured (1:1, so never spammy).
  void notify(
    { userIds: [assignment.riderProfile.userId], channels: ['inapp', 'push', 'whatsapp', 'sms'] },
    {
      title: 'New delivery offer',
      body: 'A nearby customer delivery is waiting. Open the app to accept or reject.',
      data: { type: 'delivery-offer', assignmentId: assignment.id, deliveryId: delivery.id },
    }
  );
}
