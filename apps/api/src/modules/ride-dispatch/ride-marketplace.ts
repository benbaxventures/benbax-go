import { Prisma, RideTripStatus } from '@prisma/client';
import type { Server } from 'socket.io';
import { prisma } from '../../config/prisma';
import { realtimeEvents } from '../../realtime/events';
import { haversineKm } from '../../realtime/presence';
import { AppError, notFound } from '../../utils/http';
import { normalizePhoneNumber } from '../../utils/phone';
import { recordTripStatusEvent } from '../orders/status-events';

/**
 * Open ride marketplace.
 *
 * Every ride request is visible to every online driver nationwide, with no
 * distance cut-off. The dispatch engine still pushes a targeted, time-boxed
 * offer to the best-ranked driver, but any driver can accept an open request
 * directly. Whoever accepts first wins: `claimRide` flips the trip out of an
 * open status inside a single conditional update, so two drivers can never
 * both get the same passenger.
 */

/** Trip statuses in which a ride is still waiting for a driver. */
export const OPEN_RIDE_STATUSES: RideTripStatus[] = [
  RideTripStatus.REQUESTED,
  RideTripStatus.ASSIGNING,
];

/** Trip statuses in which a driver is committed to the passenger. */
export const ACTIVE_RIDE_STATUSES: RideTripStatus[] = [
  RideTripStatus.ASSIGNED,
  RideTripStatus.DRIVER_ARRIVING,
  RideTripStatus.ARRIVED,
  RideTripStatus.IN_PROGRESS,
];

/** Unclaimed requests older than this are closed as unfulfilled. */
export const OPEN_REQUEST_MAX_AGE_MS = 30 * 60 * 1000;
/** Scheduled rides appear in the open list this long before pickup time. */
const SCHEDULED_VISIBLE_AHEAD_MS = 30 * 60 * 1000;

/**
 * User fields that are safe to put on the wire. Never include the whole user
 * row: it carries the password hash.
 */
export const SAFE_USER_SELECT = {
  id: true,
  name: true,
  phone: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

/** Driver fields a passenger may see about their assigned driver. */
export const PUBLIC_DRIVER_PROFILE_SELECT = {
  id: true,
  userId: true,
  rating: true,
  totalTrips: true,
  status: true,
  currentLatitude: true,
  currentLongitude: true,
  lastLocationAt: true,
  user: { select: SAFE_USER_SELECT },
  vehicle: true,
} satisfies Prisma.DriverProfileSelect;

/** Shape of every ride assignment emitted over the socket or returned by REST. */
export const RIDE_ASSIGNMENT_INCLUDE = {
  driverProfile: { select: PUBLIC_DRIVER_PROFILE_SELECT },
  trip: {
    include: {
      passenger: { select: { id: true, name: true, phone: true } },
    },
  },
} satisfies Prisma.RideAssignmentInclude;

export type RideAssignmentPayload = Prisma.RideAssignmentGetPayload<{
  include: typeof RIDE_ASSIGNMENT_INCLUDE;
}>;

type Point = { latitude: number; longitude: number };

export type OpenRideRequest = {
  tripId: string;
  tripCode: string;
  status: RideTripStatus;
  passengerId: string;
  passengerName: string | null;
  pickup: {
    label: string;
    address: string | null;
    landmark: string | null;
    latitude: number;
    longitude: number;
  };
  dropoff: {
    label: string;
    address: string | null;
    landmark: string | null;
    latitude: number;
    longitude: number;
  };
  fare: number;
  currency: 'GHS';
  tripDistanceKm: number;
  etaMinutes: number;
  vehicleType: string;
  notes: string | null;
  createdAt: string;
  scheduledFor: string | null;
  /** Straight-line km from the requesting driver to the pickup, when known. */
  distanceToPickupKm: number | null;
};

type TripWithPassenger = Prisma.RideTripGetPayload<{
  include: { passenger: { select: { id: true; name: true } } };
}>;

export function toOpenRideRequest(trip: TripWithPassenger, from?: Point | null): OpenRideRequest {
  const pickup = {
    label: trip.pickupLabel,
    address: trip.pickupAddress,
    landmark: trip.pickupLandmark,
    latitude: Number(trip.pickupLatitude),
    longitude: Number(trip.pickupLongitude),
  };
  return {
    tripId: trip.id,
    tripCode: trip.tripCode,
    status: trip.status,
    passengerId: trip.passengerId,
    passengerName: trip.passenger?.name ?? null,
    pickup,
    dropoff: {
      label: trip.dropoffLabel,
      address: trip.dropoffAddress,
      landmark: trip.dropoffLandmark,
      latitude: Number(trip.dropoffLatitude),
      longitude: Number(trip.dropoffLongitude),
    },
    fare: Number(trip.totalFare),
    currency: 'GHS',
    tripDistanceKm: Number(trip.distanceKm),
    etaMinutes: trip.etaMinutes,
    vehicleType: trip.requestedVehicleType ?? 'ECONOMY',
    notes: trip.notes,
    createdAt: trip.createdAt.toISOString(),
    scheduledFor: trip.scheduledFor?.toISOString() ?? null,
    distanceToPickupKm: from ? Math.round(haversineKm(from, pickup) * 10) / 10 : null,
  };
}

/** Filter matching requests a driver may pick up right now. */
function openRequestWhere(now = Date.now()): Prisma.RideTripWhereInput {
  const oldest = new Date(now - OPEN_REQUEST_MAX_AGE_MS);
  return {
    status: { in: OPEN_RIDE_STATUSES },
    OR: [
      { scheduledFor: null, createdAt: { gte: oldest } },
      { scheduledFor: { gte: oldest, lte: new Date(now + SCHEDULED_VISIBLE_AHEAD_MS) } },
    ],
  };
}

/**
 * Every ride request still waiting for a driver, nationwide, nearest pickup
 * first when the driver's position is known.
 */
export async function listOpenRideRequests(from?: Point | null): Promise<OpenRideRequest[]> {
  const trips = await prisma.rideTrip.findMany({
    where: openRequestWhere(),
    include: { passenger: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const requests = trips.map((trip) => toOpenRideRequest(trip, from));
  if (from) {
    requests.sort((a, b) => (a.distanceToPickupKm ?? 0) - (b.distanceToPickupKm ?? 0));
  }
  return requests;
}

/** Tells every connected driver that a new request is up for grabs. */
export async function broadcastOpenRideRequest(io: Server | undefined, tripId: string) {
  if (!io) return;
  const trip = await prisma.rideTrip.findUnique({
    where: { id: tripId },
    include: { passenger: { select: { id: true, name: true } } },
  });
  if (!trip || !OPEN_RIDE_STATUSES.includes(trip.status)) return;
  io.to('drivers').emit(realtimeEvents.rideOpen, toOpenRideRequest(trip));
}

/** Tells every connected driver to drop a request from their open list. */
export function broadcastRideRequestClosed(
  io: Server | undefined,
  tripId: string,
  reason: 'taken' | 'cancelled' | 'expired',
  takenByDriverUserId?: string
) {
  io?.to('drivers').emit(realtimeEvents.rideClosed, {
    tripId,
    reason,
    ...(takenByDriverUserId ? { driverId: takenByDriverUserId } : {}),
  });
}

/** Normalises the passenger phone on an assignment so the driver can dial it. */
export function withDialablePhones(assignment: RideAssignmentPayload): RideAssignmentPayload {
  return {
    ...assignment,
    driverProfile: {
      ...assignment.driverProfile,
      user: {
        ...assignment.driverProfile.user,
        phone: normalizePhoneNumber(assignment.driverProfile.user.phone) ?? '',
      },
    },
    trip: {
      ...assignment.trip,
      passenger: {
        ...assignment.trip.passenger,
        phone: normalizePhoneNumber(assignment.trip.passenger.phone) ?? '',
      },
    },
  };
}

/** Finds the ride the driver is currently committed to, if any. */
export async function findActiveRideForDriver(driverProfileId: string) {
  return prisma.rideAssignment.findFirst({
    where: {
      driverProfileId,
      status: 'ACCEPTED',
      trip: { status: { in: ACTIVE_RIDE_STATUSES } },
    },
    orderBy: { respondedAt: 'desc' },
    include: RIDE_ASSIGNMENT_INCLUDE,
  });
}

/**
 * A driver accepts a ride: either the targeted offer they were sent
 * (`assignmentId`) or any open request from the marketplace list.
 *
 * Race-safe. The trip only moves to ASSIGNED if it is still open at write
 * time, so when several drivers tap Accept together exactly one succeeds and
 * the rest get a 409 telling them the ride was taken.
 */
export async function claimRide(input: {
  tripId: string;
  driverUserId: string;
  assignmentId?: string;
  io?: Server;
}): Promise<RideAssignmentPayload> {
  const { tripId, driverUserId, assignmentId, io } = input;

  const driver = await prisma.driverProfile.findUnique({
    where: { userId: driverUserId },
    select: { id: true, status: true },
  });
  if (!driver) throw notFound('Driver profile not found');
  if (driver.status === 'SUSPENDED') {
    throw new AppError(403, 'DRIVER_SUSPENDED', 'Your driver account is suspended.');
  }

  const active = await findActiveRideForDriver(driver.id);
  if (active && active.tripId !== tripId) {
    throw new AppError(
      409,
      'DRIVER_BUSY',
      'Finish or cancel your current trip before accepting another.',
      { tripId: active.tripId }
    );
  }
  if (active && active.tripId === tripId) return withDialablePhones(active);

  const before = await prisma.rideTrip.findUnique({
    where: { id: tripId },
    select: { status: true },
  });
  if (!before) throw notFound('Ride trip not found');

  const now = new Date();
  const accepted = await prisma.$transaction(async (tx) => {
    // The conditional update is the lock: only one driver can move the trip
    // out of an open status.
    const flipped = await tx.rideTrip.updateMany({
      where: { id: tripId, status: { in: OPEN_RIDE_STATUSES } },
      data: { status: RideTripStatus.ASSIGNED },
    });
    if (flipped.count === 0) return null;

    const existing = await tx.rideAssignment.findFirst({
      where: {
        tripId,
        driverProfileId: driver.id,
        ...(assignmentId ? { id: assignmentId } : {}),
      },
      orderBy: { offeredAt: 'desc' },
      select: { id: true },
    });

    const assignment = existing
      ? await tx.rideAssignment.update({
          where: { id: existing.id },
          data: { status: 'ACCEPTED', respondedAt: now },
          select: { id: true },
        })
      : await tx.rideAssignment.create({
          data: {
            tripId,
            driverProfileId: driver.id,
            status: 'ACCEPTED',
            score: new Prisma.Decimal(0),
            offeredAt: now,
            respondedAt: now,
            expiresAt: now,
          },
          select: { id: true },
        });

    // Any offer still pending for another driver is now void.
    await tx.rideAssignment.updateMany({
      where: { tripId, status: 'OFFERED', id: { not: assignment.id } },
      data: { status: 'EXPIRED', respondedAt: now },
    });

    await tx.driverProfile.update({
      where: { id: driver.id },
      data: { status: 'ON_TRIP' },
    });

    return tx.rideAssignment.findUniqueOrThrow({
      where: { id: assignment.id },
      include: RIDE_ASSIGNMENT_INCLUDE,
    });
  });

  if (!accepted) {
    const current = await prisma.rideTrip.findUnique({
      where: { id: tripId },
      select: { status: true },
    });
    const message =
      current?.status === RideTripStatus.CANCELLED
        ? 'The passenger cancelled this ride.'
        : 'Another driver already accepted this ride.';
    throw new AppError(409, 'RIDE_UNAVAILABLE', message, { status: current?.status ?? null });
  }

  await recordTripStatusEvent(tripId, {
    fromStatus: before.status,
    toStatus: RideTripStatus.ASSIGNED,
    actorId: driverUserId,
    note: assignmentId ? 'Driver accepted the offer' : 'Driver accepted from open requests',
  });

  const payload = withDialablePhones(accepted);
  const updatedTrip = await prisma.rideTrip.findUnique({ where: { id: tripId } });

  io?.to(`ride:${tripId}`).emit(realtimeEvents.rideAssigned, payload);
  io?.to(`user:${payload.trip.passengerId}`).emit(realtimeEvents.rideAssigned, payload);
  io?.to(`user:${payload.trip.passengerId}`).emit(realtimeEvents.rideUpdated, updatedTrip);
  io?.to(`ride:${tripId}`).emit(realtimeEvents.rideUpdated, updatedTrip);
  io?.to(`driver:${driverUserId}`).emit(realtimeEvents.rideAssigned, payload);
  io?.to('admins').emit(realtimeEvents.rideAssigned, payload);
  broadcastRideRequestClosed(io, tripId, 'taken', driverUserId);

  return payload;
}
