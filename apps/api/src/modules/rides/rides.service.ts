import type { PaymentMethod, UserRole } from '@prisma/client';
import { CancelActor, Prisma, RideTripStatus } from '@prisma/client';
import { nanoid } from 'nanoid';
import { prisma } from '../../config/prisma';
import { badRequest, forbidden, notFound } from '../../utils/http';
import { estimateRide } from '../dispatch/dispatch.engine';
import { notifyRideRequested } from '../notifications/triggers';
import { recordTripStatusEvent } from '../orders/status-events';
import { settleRideTrip } from '../payments/settlement';
import { buildExpectedRoute } from '../tracking/routeSafety';

const CANCELLABLE_STATUSES: RideTripStatus[] = [
  RideTripStatus.REQUESTED,
  RideTripStatus.ASSIGNING,
  RideTripStatus.ASSIGNED,
  RideTripStatus.DRIVER_ARRIVING,
  RideTripStatus.ARRIVED,
];

type CoordinateInput = {
  label: string;
  address?: string;
  latitude: number;
  longitude: number;
  landmark?: string;
};

type CreateRideInput = {
  passengerId: string;
  pickup: CoordinateInput;
  dropoff: CoordinateInput;
  requestedVehicleType?: string;
  scheduledFor?: string;
  notes?: string;
  paymentMethod?: PaymentMethod;
};

export async function quoteRide(
  input: Pick<CreateRideInput, 'pickup' | 'dropoff' | 'requestedVehicleType'>
) {
  const quote = estimateRide(input.pickup, input.dropoff, input.requestedVehicleType);
  return {
    ...quote,
    currency: 'GHS' as const,
  };
}

export async function createRide(input: CreateRideInput) {
  const quote = await quoteRide(input);
  const expectedRoute = await buildExpectedRoute(
    { latitude: input.pickup.latitude, longitude: input.pickup.longitude },
    { latitude: input.dropoff.latitude, longitude: input.dropoff.longitude }
  );

  const trip = await prisma.rideTrip.create({
    data: {
      tripCode: `RIDE-${nanoid(8).toUpperCase()}`,
      passengerId: input.passengerId,
      status: RideTripStatus.REQUESTED,
      pickupLabel: input.pickup.label,
      pickupAddress: input.pickup.address ?? null,
      pickupLatitude: new Prisma.Decimal(input.pickup.latitude),
      pickupLongitude: new Prisma.Decimal(input.pickup.longitude),
      pickupLandmark: input.pickup.landmark ?? null,
      dropoffLabel: input.dropoff.label,
      dropoffAddress: input.dropoff.address ?? null,
      dropoffLatitude: new Prisma.Decimal(input.dropoff.latitude),
      dropoffLongitude: new Prisma.Decimal(input.dropoff.longitude),
      dropoffLandmark: input.dropoff.landmark ?? null,
      requestedVehicleType: input.requestedVehicleType ?? 'ECONOMY',
      ...(input.scheduledFor ? { scheduledFor: new Date(input.scheduledFor) } : {}),
      distanceKm: quote.distanceKm,
      etaMinutes: quote.estimatedMinutes,
      baseFare: quote.baseFare,
      perKmFare: quote.perKmFare,
      perMinuteFare: quote.perMinuteFare,
      surgeMultiplier: quote.surgeMultiplier,
      totalFare: quote.total,
      notes: input.notes ?? null,
      metadata: { expectedRoute, vehicleMultiplier: quote.vehicleMultiplier },
      ...(input.paymentMethod
        ? {
            payment: {
              create: {
                method: input.paymentMethod,
                amount: quote.total,
                currency: 'GHS',
              },
            },
          }
        : {}),
    },
    include: {
      payment: true,
      assignments: true,
    },
  });

  await recordTripStatusEvent(trip.id, {
    fromStatus: null,
    toStatus: RideTripStatus.REQUESTED,
    actorId: input.passengerId,
    note: 'Ride requested',
  });

  // Alert the driver fleet and ops team that a new ride is up for grabs.
  notifyRideRequested(trip);

  return trip;
}

export async function listPassengerRides(passengerId: string) {
  return prisma.rideTrip.findMany({
    where: { passengerId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { payment: true, assignments: { take: 1, orderBy: { offeredAt: 'desc' } } },
  });
}

export async function getRide(id: string, requesterId: string) {
  const ride = await prisma.rideTrip.findFirst({
    where: {
      id,
      OR: [
        { passengerId: requesterId },
        { assignments: { some: { driverProfile: { userId: requesterId } } } },
      ],
    },
    include: {
      payment: true,
      rating: true,
      trackingPoints: { orderBy: { capturedAt: 'desc' }, take: 25 },
      assignments: {
        include: { driverProfile: { include: { user: true, vehicle: true } } },
        orderBy: { offeredAt: 'desc' },
      },
    },
  });

  if (!ride) throw notFound('Ride trip not found');
  return ride;
}

export async function updateRideStatus(id: string, status: RideTripStatus, actorId?: string) {
  const current = await prisma.rideTrip.findUnique({ where: { id }, select: { status: true } });
  if (!current) throw notFound('Ride trip not found');

  await prisma.rideTrip.update({
    where: { id },
    data: { status },
  });

  if (current.status !== status) {
    await recordTripStatusEvent(id, {
      fromStatus: current.status,
      toStatus: status,
      actorId: actorId ?? null,
    });
  }

  // Completing a trip settles the fare: credits the driver's wallet (digital)
  // or records commission owed (cash), and releases the driver back to ACTIVE.
  if (status === RideTripStatus.COMPLETED) {
    await settleRideTrip(id);
  }

  return prisma.rideTrip.findUnique({
    where: { id },
    include: { payment: true },
  });
}

function resolveCancelActor(
  requester: { id: string; role: UserRole },
  ownerId: string
): CancelActor {
  if (requester.id === ownerId) return CancelActor.CUSTOMER;
  if (
    requester.role === 'ADMIN' ||
    requester.role === 'OPERATIONS' ||
    requester.role === 'SUPPORT'
  ) {
    return CancelActor.ADMIN;
  }
  if (requester.role === 'DRIVER') return CancelActor.DRIVER;
  if (requester.role === 'RIDER') return CancelActor.RIDER;
  return CancelActor.SYSTEM;
}

export async function cancelRide(
  id: string,
  requester: { id: string; role: UserRole },
  reason?: string
) {
  const trip = await prisma.rideTrip.findUnique({
    where: { id },
    include: {
      assignments: {
        where: { status: { in: ['OFFERED', 'ACCEPTED'] } },
        include: { driverProfile: { select: { id: true, userId: true } } },
      },
    },
  });
  if (!trip) throw notFound('Ride trip not found');

  const isOwner = trip.passengerId === requester.id;
  const isStaff =
    requester.role === 'ADMIN' || requester.role === 'OPERATIONS' || requester.role === 'SUPPORT';
  const isAssignedDriver = trip.assignments.some(
    (assignment) => assignment.driverProfile.userId === requester.id
  );
  if (!isOwner && !isStaff && !isAssignedDriver) {
    throw forbidden('You cannot cancel this ride');
  }

  if (trip.status === RideTripStatus.CANCELLED) return trip;
  if (!CANCELLABLE_STATUSES.includes(trip.status)) {
    throw badRequest(`Ride can no longer be cancelled (status: ${trip.status})`);
  }

  const cancelledBy = resolveCancelActor(requester, trip.passengerId);

  const updated = await prisma.$transaction(async (tx) => {
    // Release the driver and expire open offers so they can take new trips.
    for (const assignment of trip.assignments) {
      await tx.rideAssignment.update({
        where: { id: assignment.id },
        data: { status: 'EXPIRED', respondedAt: assignment.respondedAt ?? new Date() },
      });
      await tx.driverProfile.update({
        where: { id: assignment.driverProfile.id },
        data: { status: 'ACTIVE' },
      });
    }
    return tx.rideTrip.update({
      where: { id },
      data: {
        status: RideTripStatus.CANCELLED,
        cancelledBy,
        cancellationReason: reason ?? null,
      },
    });
  });

  await recordTripStatusEvent(id, {
    fromStatus: trip.status,
    toStatus: RideTripStatus.CANCELLED,
    actorId: requester.id,
    note: reason ? `Cancelled by ${cancelledBy}: ${reason}` : `Cancelled by ${cancelledBy}`,
  });

  return updated;
}
