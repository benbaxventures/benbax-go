import type { PaymentMethod } from '@prisma/client';
import { Prisma, RideTripStatus } from '@prisma/client';
import { nanoid } from 'nanoid';
import { prisma } from '../../config/prisma';
import { notFound } from '../../utils/http';
import { estimateRide } from '../dispatch/dispatch.engine';
import { settleRideTrip } from '../payments/settlement';
import { buildExpectedRoute } from '../tracking/routeSafety';

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

  return prisma.rideTrip.create({
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

export async function updateRideStatus(id: string, status: RideTripStatus) {
  await prisma.rideTrip.update({
    where: { id },
    data: { status },
  });

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
