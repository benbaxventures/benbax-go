import { RideTripStatus } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { listOnlineClients, listOnlineDrivers } from '../../realtime/presence';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/response';
import {
  ACTIVE_RIDE_STATUSES,
  OPEN_REQUEST_MAX_AGE_MS,
  OPEN_RIDE_STATUSES,
} from '../ride-dispatch/ride-marketplace';

/**
 * Live operations for the admin god-view: who is actually online right now
 * (from the realtime presence registry, not the stale DB `isOnline` flag),
 * every ride waiting for or with a driver, and today's real numbers.
 */
export const operationsRouter = Router();

const RECENT_RIDES_WINDOW_MS = 24 * 60 * 60 * 1000;

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// GET /admin/ops/overview — headline numbers for the Overview and Live ops pages.
operationsRouter.get(
  '/ops/overview',
  asyncHandler(async (_req, res) => {
    const today = startOfToday();
    const openSince = new Date(Date.now() - OPEN_REQUEST_MAX_AGE_MS);
    const liveDrivers = listOnlineDrivers();
    const liveIds = liveDrivers.map((d) => d.id);

    const [
      totalUsers,
      totalDrivers,
      totalRiders,
      busyLiveDrivers,
      ghostDrivers,
      openRides,
      activeRides,
      completedToday,
      cancelledToday,
      requestedToday,
      revenueToday,
      activeDeliveries,
      revenueAllTime,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.driverProfile.count(),
      prisma.riderProfile.count(),
      liveIds.length
        ? prisma.driverProfile.count({ where: { userId: { in: liveIds }, status: 'ON_TRIP' } })
        : Promise.resolve(0),
      // Marked online in the DB but no live app: shown so ops can spot them.
      prisma.driverProfile.count({
        where: { isOnline: true, ...(liveIds.length ? { userId: { notIn: liveIds } } : {}) },
      }),
      prisma.rideTrip.count({
        where: { status: { in: OPEN_RIDE_STATUSES }, createdAt: { gte: openSince } },
      }),
      prisma.rideTrip.count({ where: { status: { in: ACTIVE_RIDE_STATUSES } } }),
      prisma.rideTrip.count({
        where: { status: RideTripStatus.COMPLETED, updatedAt: { gte: today } },
      }),
      prisma.rideTrip.count({
        where: { status: RideTripStatus.CANCELLED, updatedAt: { gte: today } },
      }),
      prisma.rideTrip.count({ where: { createdAt: { gte: today } } }),
      prisma.rideTrip.aggregate({
        where: { status: RideTripStatus.COMPLETED, updatedAt: { gte: today } },
        _sum: { totalFare: true },
      }),
      prisma.delivery.count({
        where: {
          status: { in: ['REQUESTED', 'ASSIGNING', 'ASSIGNED', 'PICKING_UP', 'IN_TRANSIT'] },
        },
      }),
      prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
    ]);

    return ok(res, {
      users: totalUsers,
      drivers: {
        total: totalDrivers,
        live: liveDrivers.length,
        busy: busyLiveDrivers,
        idle: Math.max(0, liveDrivers.length - busyLiveDrivers),
        staleOnline: ghostDrivers,
      },
      riders: { total: totalRiders },
      passengersOnline: listOnlineClients().length,
      rides: {
        open: openRides,
        active: activeRides,
        requestedToday,
        completedToday,
        cancelledToday,
        revenueTodayGhs: Number(revenueToday._sum.totalFare ?? 0),
      },
      deliveries: { active: activeDeliveries },
      revenueGhs: Number(revenueAllTime._sum.amount ?? 0),
    });
  })
);

// GET /admin/ops/presence — every live driver and passenger with position.
operationsRouter.get(
  '/ops/presence',
  asyncHandler(async (_req, res) => {
    const liveDrivers = listOnlineDrivers();
    const liveClients = listOnlineClients();

    const [driverProfiles, clientUsers, openTrips] = await Promise.all([
      liveDrivers.length
        ? prisma.driverProfile.findMany({
            where: { userId: { in: liveDrivers.map((d) => d.id) } },
            select: {
              id: true,
              userId: true,
              status: true,
              rating: true,
              kycStatus: true,
              user: { select: { name: true, phone: true } },
              vehicle: { select: { type: true, plateNumber: true, color: true, make: true } },
              assignments: {
                where: { status: 'ACCEPTED', trip: { status: { in: ACTIVE_RIDE_STATUSES } } },
                select: { tripId: true },
                take: 1,
              },
            },
          })
        : Promise.resolve([]),
      liveClients.length
        ? prisma.user.findMany({
            where: { id: { in: liveClients.map((c) => c.id) } },
            select: { id: true, name: true, phone: true },
          })
        : Promise.resolve([]),
      liveClients.length
        ? prisma.rideTrip.findMany({
            where: {
              passengerId: { in: liveClients.map((c) => c.id) },
              status: { in: [...OPEN_RIDE_STATUSES, ...ACTIVE_RIDE_STATUSES] },
            },
            select: { id: true, passengerId: true, status: true },
          })
        : Promise.resolve([]),
    ]);

    const profileByUser = new Map(driverProfiles.map((p) => [p.userId, p]));
    const userById = new Map(clientUsers.map((u) => [u.id, u]));
    const tripByPassenger = new Map(openTrips.map((t) => [t.passengerId, t]));

    return ok(res, {
      drivers: liveDrivers.map((driver) => {
        const profile = profileByUser.get(driver.id);
        return {
          userId: driver.id,
          driverProfileId: profile?.id ?? null,
          name: profile?.user.name ?? driver.name ?? 'Driver',
          phone: profile?.user.phone ?? null,
          status: profile?.status ?? 'ACTIVE',
          busy: profile?.status === 'ON_TRIP',
          activeTripId: profile?.assignments[0]?.tripId ?? null,
          rating: profile ? Number(profile.rating) : null,
          kycStatus: profile?.kycStatus ?? null,
          vehicle: profile?.vehicle ?? null,
          latitude: driver.latitude,
          longitude: driver.longitude,
          heading: driver.heading ?? null,
          onlineSince: driver.since,
          lastSeenAt: new Date(driver.lastSeenAt).toISOString(),
        };
      }),
      passengers: liveClients.map((client) => {
        const user = userById.get(client.id);
        const trip = tripByPassenger.get(client.id);
        return {
          userId: client.id,
          name: user?.name ?? client.name ?? 'Passenger',
          phone: user?.phone ?? null,
          latitude: client.latitude,
          longitude: client.longitude,
          onlineSince: client.since,
          lastSeenAt: new Date(client.lastSeenAt).toISOString(),
          tripId: trip?.id ?? null,
          tripStatus: trip?.status ?? null,
        };
      }),
    });
  })
);

const DRIVER_SUMMARY_SELECT = {
  id: true,
  userId: true,
  user: { select: { name: true, phone: true } },
  vehicle: { select: { type: true, plateNumber: true, color: true, make: true } },
} as const;

// GET /admin/ops/rides — open requests, trips in progress, and recent outcomes.
operationsRouter.get(
  '/ops/rides',
  asyncHandler(async (_req, res) => {
    const now = Date.now();
    const openSince = new Date(now - OPEN_REQUEST_MAX_AGE_MS);
    const recentSince = new Date(now - RECENT_RIDES_WINDOW_MS);

    const tripInclude = {
      passenger: { select: { id: true, name: true, phone: true } },
      assignments: {
        orderBy: { offeredAt: 'desc' as const },
        select: {
          id: true,
          status: true,
          offeredAt: true,
          expiresAt: true,
          respondedAt: true,
          driverProfile: { select: DRIVER_SUMMARY_SELECT },
        },
      },
      trackingPoints: {
        orderBy: { capturedAt: 'desc' as const },
        take: 1,
        select: { latitude: true, longitude: true, capturedAt: true },
      },
    };

    const [open, active, recent] = await Promise.all([
      prisma.rideTrip.findMany({
        where: {
          status: { in: OPEN_RIDE_STATUSES },
          OR: [{ createdAt: { gte: openSince } }, { scheduledFor: { gte: openSince } }],
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: tripInclude,
      }),
      prisma.rideTrip.findMany({
        where: { status: { in: ACTIVE_RIDE_STATUSES } },
        orderBy: { updatedAt: 'desc' },
        take: 100,
        include: tripInclude,
      }),
      prisma.rideTrip.findMany({
        where: {
          status: { in: [RideTripStatus.COMPLETED, RideTripStatus.CANCELLED] },
          updatedAt: { gte: recentSince },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        include: tripInclude,
      }),
    ]);

    type TripRow = (typeof open)[number];
    const toRow = (trip: TripRow) => {
      const pendingOffer = trip.assignments.find(
        (a) => a.status === 'OFFERED' && a.expiresAt.getTime() > now
      );
      const accepted = trip.assignments.find(
        (a) => a.status === 'ACCEPTED' || a.status === 'COMPLETED'
      );
      const lastPoint = trip.trackingPoints[0];
      return {
        id: trip.id,
        tripCode: trip.tripCode,
        status: trip.status,
        createdAt: trip.createdAt,
        updatedAt: trip.updatedAt,
        scheduledFor: trip.scheduledFor,
        ageMinutes: Math.floor((now - trip.createdAt.getTime()) / 60_000),
        passenger: trip.passenger,
        pickup: {
          label: trip.pickupLabel,
          latitude: Number(trip.pickupLatitude),
          longitude: Number(trip.pickupLongitude),
        },
        dropoff: {
          label: trip.dropoffLabel,
          latitude: Number(trip.dropoffLatitude),
          longitude: Number(trip.dropoffLongitude),
        },
        fare: Number(trip.totalFare),
        distanceKm: Number(trip.distanceKm),
        vehicleType: trip.requestedVehicleType,
        cancellationReason: trip.cancellationReason,
        cancelledBy: trip.cancelledBy,
        offers: {
          total: trip.assignments.length,
          declined: trip.assignments.filter((a) => a.status === 'REJECTED').length,
          lapsed: trip.assignments.filter((a) => a.status === 'EXPIRED').length,
        },
        pendingOffer: pendingOffer
          ? {
              assignmentId: pendingOffer.id,
              expiresAt: pendingOffer.expiresAt,
              driver: pendingOffer.driverProfile,
            }
          : null,
        driver: accepted?.driverProfile ?? null,
        driverPosition: lastPoint
          ? {
              latitude: Number(lastPoint.latitude),
              longitude: Number(lastPoint.longitude),
              capturedAt: lastPoint.capturedAt,
            }
          : null,
      };
    };

    return ok(res, {
      open: open.map(toRow),
      active: active.map(toRow),
      recent: recent.map(toRow),
    });
  })
);
