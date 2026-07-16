import type { Prisma } from '@prisma/client';
import { KycStatus, UserRole, UserStatus } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { badRequest, notFound } from '../../utils/http';
import { ok } from '../../utils/response';

export const monitoringRouter = Router();

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;
const ACTIVITY_FEED_LIMIT = 60;
const USER_ACTIVITY_LIMIT = 100;
const STUCK_UNASSIGNED_MINUTES = 5;
const STUCK_NO_PICKUP_MINUTES = 15;
const DEMAND_WINDOW_HOURS = 24;

type ActivityEvent = {
  id: string;
  type: string;
  title: string;
  detail: string;
  at: Date;
};

function parsePagination(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(query.pageSize) || DEFAULT_PAGE_SIZE)
  );
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function sortEventsDesc(events: ActivityEvent[], limit: number) {
  return [...events].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

// GET /admin/users — every registered/logged-in account with registration time,
// last-seen time, contact details, and activity counts.
monitoringRouter.get(
  '/users',
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip } = parsePagination(req.query);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    const where: Prisma.UserWhereInput = {
      ...(role && role in UserRole ? { role: role as UserRole } : {}),
      ...(status && status in UserStatus ? { status: status as UserStatus } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          createdAt: true,
          lastSeenAt: true,
          wallet: { select: { balance: true, currency: true } },
          riderProfile: {
            select: { status: true, kycStatus: true, isOnline: true, totalDeliveries: true },
          },
          driverProfile: {
            select: { status: true, kycStatus: true, isOnline: true, totalTrips: true },
          },
          _count: {
            select: { deliveries: true, rideTrips: true, supportCases: true },
          },
        },
      }),
    ]);

    return ok(res, { items: users, total, page, pageSize });
  })
);

// GET /admin/users/:id/activity — merged activity timeline for one account.
monitoringRouter.get(
  '/users/:id/activity',
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id) throw badRequest('User id is required');

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
        lastSeenAt: true,
        riderProfile: { select: { id: true } },
        driverProfile: { select: { id: true } },
      },
    });
    if (!user) throw notFound('User not found');

    const [
      sessions,
      auditLogs,
      deliveries,
      rideTrips,
      walletTransactions,
      supportTickets,
      ratings,
      rideRatings,
      riderAssignments,
      riderKycDocuments,
      driverAssignments,
      driverKycDocuments,
    ] = await Promise.all([
      prisma.refreshToken.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          userAgent: true,
          ipAddress: true,
          createdAt: true,
          expiresAt: true,
          revokedAt: true,
        },
      }),
      prisma.auditLog.findMany({
        where: { actorId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.delivery.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, trackingCode: true, status: true, totalFare: true, createdAt: true },
      }),
      prisma.rideTrip.findMany({
        where: { passengerId: id },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, tripCode: true, status: true, totalFare: true, createdAt: true },
      }),
      prisma.walletTransaction.findMany({
        where: { wallet: { userId: id } },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, type: true, amount: true, reference: true, createdAt: true },
      }),
      prisma.supportTicket.findMany({
        where: { requesterId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, subject: true, status: true, createdAt: true },
      }),
      prisma.rating.findMany({
        where: { authorId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, score: true, targetType: true, createdAt: true },
      }),
      prisma.rideRating.findMany({
        where: { authorId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, score: true, targetType: true, createdAt: true },
      }),
      user.riderProfile
        ? prisma.deliveryAssignment.findMany({
            where: { riderProfileId: user.riderProfile.id },
            orderBy: { offeredAt: 'desc' },
            take: 30,
            select: {
              id: true,
              status: true,
              offeredAt: true,
              respondedAt: true,
              delivery: { select: { trackingCode: true } },
            },
          })
        : Promise.resolve([]),
      user.riderProfile
        ? prisma.kycDocument.findMany({
            where: { riderProfileId: user.riderProfile.id },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: { id: true, type: true, status: true, createdAt: true },
          })
        : Promise.resolve([]),
      user.driverProfile
        ? prisma.rideAssignment.findMany({
            where: { driverProfileId: user.driverProfile.id },
            orderBy: { offeredAt: 'desc' },
            take: 30,
            select: {
              id: true,
              status: true,
              offeredAt: true,
              respondedAt: true,
              trip: { select: { tripCode: true } },
            },
          })
        : Promise.resolve([]),
      user.driverProfile
        ? prisma.driverKycDocument.findMany({
            where: { driverProfileId: user.driverProfile.id },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: { id: true, type: true, status: true, createdAt: true },
          })
        : Promise.resolve([]),
    ]);

    const events: ActivityEvent[] = [
      {
        id: `registered-${user.id}`,
        type: 'ACCOUNT',
        title: 'Account registered',
        detail: `Joined as ${user.role}`,
        at: user.createdAt,
      },
      ...auditLogs.map((log) => ({
        id: `audit-${log.id}`,
        type: log.action,
        title: log.action.replaceAll('_', ' '),
        detail: log.entity + (log.entityId ? ` ${log.entityId}` : ''),
        at: log.createdAt,
      })),
      ...deliveries.map((delivery) => ({
        id: `delivery-${delivery.id}`,
        type: 'DELIVERY',
        title: `Requested delivery ${delivery.trackingCode}`,
        detail: `${delivery.status} · GHS ${delivery.totalFare}`,
        at: delivery.createdAt,
      })),
      ...rideTrips.map((trip) => ({
        id: `trip-${trip.id}`,
        type: 'RIDE',
        title: `Booked ride ${trip.tripCode}`,
        detail: `${trip.status} · GHS ${trip.totalFare}`,
        at: trip.createdAt,
      })),
      ...walletTransactions.map((tx) => ({
        id: `wallet-${tx.id}`,
        type: 'WALLET',
        title: `Wallet ${tx.type.toLowerCase().replaceAll('_', ' ')}`,
        detail: `GHS ${tx.amount}${tx.reference ? ` · ${tx.reference}` : ''}`,
        at: tx.createdAt,
      })),
      ...supportTickets.map((ticket) => ({
        id: `support-${ticket.id}`,
        type: 'SUPPORT',
        title: 'Opened support ticket',
        detail: `${ticket.subject} · ${ticket.status}`,
        at: ticket.createdAt,
      })),
      ...ratings.map((rating) => ({
        id: `rating-${rating.id}`,
        type: 'RATING',
        title: `Rated ${rating.targetType.toLowerCase()} ${rating.score}/5`,
        detail: 'Delivery rating',
        at: rating.createdAt,
      })),
      ...rideRatings.map((rating) => ({
        id: `ride-rating-${rating.id}`,
        type: 'RATING',
        title: `Rated ${rating.targetType.toLowerCase()} ${rating.score}/5`,
        detail: 'Ride rating',
        at: rating.createdAt,
      })),
      ...riderAssignments.map((assignment) => ({
        id: `rider-assignment-${assignment.id}`,
        type: 'DISPATCH',
        title: `Delivery offer ${assignment.status.toLowerCase()}`,
        detail: assignment.delivery.trackingCode,
        at: assignment.respondedAt ?? assignment.offeredAt,
      })),
      ...driverAssignments.map((assignment) => ({
        id: `driver-assignment-${assignment.id}`,
        type: 'DISPATCH',
        title: `Ride offer ${assignment.status.toLowerCase()}`,
        detail: assignment.trip.tripCode,
        at: assignment.respondedAt ?? assignment.offeredAt,
      })),
      ...[...riderKycDocuments, ...driverKycDocuments].map((doc) => ({
        id: `kyc-${doc.id}`,
        type: 'KYC',
        title: `Submitted KYC document (${doc.type})`,
        detail: doc.status,
        at: doc.createdAt,
      })),
    ];

    return ok(res, {
      user,
      sessions,
      events: sortEventsDesc(events, USER_ACTIVITY_LIMIT),
    });
  })
);

// GET /admin/drivers — riders and drivers with online/KYC/location freshness.
monitoringRouter.get(
  '/drivers',
  asyncHandler(async (req, res) => {
    const kind =
      req.query.kind === 'RIDER' ? 'RIDER' : req.query.kind === 'DRIVER' ? 'DRIVER' : 'ALL';

    const userSelect = {
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        lastSeenAt: true,
      },
    } as const;

    const [riders, drivers] = await Promise.all([
      kind !== 'DRIVER'
        ? prisma.riderProfile.findMany({
            orderBy: { updatedAt: 'desc' },
            take: 200,
            select: {
              id: true,
              status: true,
              kycStatus: true,
              isOnline: true,
              rating: true,
              totalDeliveries: true,
              lastLocationAt: true,
              user: userSelect,
              vehicle: { select: { type: true, plateNumber: true } },
            },
          })
        : Promise.resolve([]),
      kind !== 'RIDER'
        ? prisma.driverProfile.findMany({
            orderBy: { updatedAt: 'desc' },
            take: 200,
            select: {
              id: true,
              status: true,
              kycStatus: true,
              isOnline: true,
              rating: true,
              totalTrips: true,
              lastLocationAt: true,
              user: userSelect,
              vehicle: { select: { type: true, plateNumber: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const rows = [
      ...riders.map((rider) => ({
        id: rider.id,
        kind: 'RIDER' as const,
        status: rider.status,
        kycStatus: rider.kycStatus,
        isOnline: rider.isOnline,
        rating: rider.rating,
        totalJobs: rider.totalDeliveries,
        lastLocationAt: rider.lastLocationAt,
        vehicle: rider.vehicle,
        user: rider.user,
      })),
      ...drivers.map((driver) => ({
        id: driver.id,
        kind: 'DRIVER' as const,
        status: driver.status,
        kycStatus: driver.kycStatus,
        isOnline: driver.isOnline,
        rating: driver.rating,
        totalJobs: driver.totalTrips,
        lastLocationAt: driver.lastLocationAt,
        vehicle: driver.vehicle,
        user: driver.user,
      })),
    ];

    const summary = {
      total: rows.length,
      online: rows.filter((row) => row.isOnline).length,
      pendingKyc: rows.filter(
        (row) => row.kycStatus === KycStatus.SUBMITTED || row.kycStatus === KycStatus.NOT_STARTED
      ).length,
    };

    return ok(res, { items: rows, summary });
  })
);

// GET /admin/supply/live — every online rider/driver with GPS position for the
// god-view map, regardless of whether they currently have a job.
monitoringRouter.get(
  '/supply/live',
  asyncHandler(async (_req, res) => {
    const select = {
      id: true,
      status: true,
      isOnline: true,
      currentLatitude: true,
      currentLongitude: true,
      lastLocationAt: true,
      user: { select: { id: true, name: true, phone: true } },
    } as const;

    const [riders, drivers] = await Promise.all([
      prisma.riderProfile.findMany({
        where: { isOnline: true, currentLatitude: { not: null } },
        select,
        take: 500,
      }),
      prisma.driverProfile.findMany({
        where: { isOnline: true, currentLatitude: { not: null } },
        select,
        take: 500,
      }),
    ]);

    type SupplyProfile = Omit<(typeof riders)[number], 'status'> & { status: string };

    const toRow = (row: SupplyProfile, kind: 'RIDER' | 'DRIVER') => ({
      id: row.id,
      kind,
      name: row.user.name,
      phone: row.user.phone,
      status: row.status,
      latitude: row.currentLatitude,
      longitude: row.currentLongitude,
      lastLocationAt: row.lastLocationAt,
      isBusy: row.status === 'ON_DELIVERY' || row.status === 'ON_TRIP',
    });

    return ok(res, [
      ...riders.map((rider) => toRow(rider, 'RIDER')),
      ...drivers.map((driver) => toRow(driver, 'DRIVER')),
    ]);
  })
);

// GET /admin/orders/stuck — orders that need operator attention right now.
monitoringRouter.get(
  '/orders/stuck',
  asyncHandler(async (_req, res) => {
    const unassignedCutoff = new Date(Date.now() - STUCK_UNASSIGNED_MINUTES * 60 * 1000);
    const noPickupCutoff = new Date(Date.now() - STUCK_NO_PICKUP_MINUTES * 60 * 1000);

    const [unassignedDeliveries, stalledDeliveries, unassignedTrips, stalledTrips] =
      await Promise.all([
        prisma.delivery.findMany({
          where: {
            status: { in: ['REQUESTED', 'ASSIGNING'] },
            createdAt: { lt: unassignedCutoff },
          },
          orderBy: { createdAt: 'asc' },
          take: 50,
          select: {
            id: true,
            trackingCode: true,
            status: true,
            createdAt: true,
            pickupLabel: true,
            customer: { select: { name: true, phone: true } },
          },
        }),
        prisma.delivery.findMany({
          where: { status: { in: ['ASSIGNED', 'PICKING_UP'] }, updatedAt: { lt: noPickupCutoff } },
          orderBy: { updatedAt: 'asc' },
          take: 50,
          select: {
            id: true,
            trackingCode: true,
            status: true,
            createdAt: true,
            pickupLabel: true,
            customer: { select: { name: true, phone: true } },
          },
        }),
        prisma.rideTrip.findMany({
          where: {
            status: { in: ['REQUESTED', 'ASSIGNING'] },
            createdAt: { lt: unassignedCutoff },
          },
          orderBy: { createdAt: 'asc' },
          take: 50,
          select: {
            id: true,
            tripCode: true,
            status: true,
            createdAt: true,
            pickupLabel: true,
            passenger: { select: { name: true, phone: true } },
          },
        }),
        prisma.rideTrip.findMany({
          where: {
            status: { in: ['ASSIGNED', 'DRIVER_ARRIVING'] },
            updatedAt: { lt: noPickupCutoff },
          },
          orderBy: { updatedAt: 'asc' },
          take: 50,
          select: {
            id: true,
            tripCode: true,
            status: true,
            createdAt: true,
            pickupLabel: true,
            passenger: { select: { name: true, phone: true } },
          },
        }),
      ]);

    const ageMinutes = (from: Date) => Math.floor((Date.now() - from.getTime()) / 60000);

    const items = [
      ...unassignedDeliveries.map((delivery) => ({
        id: delivery.id,
        kind: 'DELIVERY' as const,
        code: delivery.trackingCode,
        status: delivery.status,
        problem: 'No rider assigned',
        pickupLabel: delivery.pickupLabel,
        requester: delivery.customer,
        ageMinutes: ageMinutes(delivery.createdAt),
      })),
      ...stalledDeliveries.map((delivery) => ({
        id: delivery.id,
        kind: 'DELIVERY' as const,
        code: delivery.trackingCode,
        status: delivery.status,
        problem: 'Assigned but no pickup',
        pickupLabel: delivery.pickupLabel,
        requester: delivery.customer,
        ageMinutes: ageMinutes(delivery.createdAt),
      })),
      ...unassignedTrips.map((trip) => ({
        id: trip.id,
        kind: 'RIDE' as const,
        code: trip.tripCode,
        status: trip.status,
        problem: 'No driver assigned',
        pickupLabel: trip.pickupLabel,
        requester: trip.passenger,
        ageMinutes: ageMinutes(trip.createdAt),
      })),
      ...stalledTrips.map((trip) => ({
        id: trip.id,
        kind: 'RIDE' as const,
        code: trip.tripCode,
        status: trip.status,
        problem: 'Assigned but no pickup',
        pickupLabel: trip.pickupLabel,
        requester: trip.passenger,
        ageMinutes: ageMinutes(trip.createdAt),
      })),
    ].sort((a, b) => b.ageMinutes - a.ageMinutes);

    return ok(res, items);
  })
);

// GET /admin/demand — real orders-per-hour over the last 24h for the dashboard chart.
monitoringRouter.get(
  '/demand',
  asyncHandler(async (_req, res) => {
    const since = new Date(Date.now() - DEMAND_WINDOW_HOURS * 60 * 60 * 1000);
    const [deliveries, trips] = await Promise.all([
      prisma.delivery.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      prisma.rideTrip.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
    ]);

    const buckets = new Map<string, { deliveries: number; rides: number }>();
    for (let i = DEMAND_WINDOW_HOURS - 1; i >= 0; i -= 1) {
      const bucketDate = new Date(Date.now() - i * 60 * 60 * 1000);
      const key = `${String(bucketDate.getHours()).padStart(2, '0')}:00`;
      buckets.set(key, { deliveries: 0, rides: 0 });
    }
    const bucketKey = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:00`;
    for (const delivery of deliveries) {
      const bucket = buckets.get(bucketKey(delivery.createdAt));
      if (bucket) bucket.deliveries += 1;
    }
    for (const trip of trips) {
      const bucket = buckets.get(bucketKey(trip.createdAt));
      if (bucket) bucket.rides += 1;
    }

    return ok(
      res,
      [...buckets.entries()].map(([hour, counts]) => ({
        hour,
        deliveries: counts.deliveries,
        rides: counts.rides,
        total: counts.deliveries + counts.rides,
      }))
    );
  })
);

// GET /admin/orders/:kind/:id/timeline — full lifecycle of one order.
monitoringRouter.get(
  '/orders/:kind/:id/timeline',
  asyncHandler(async (req, res) => {
    const { kind, id } = req.params;
    if (!id) throw badRequest('Order id is required');

    if (kind === 'delivery') {
      const delivery = await prisma.delivery.findUnique({
        where: { id },
        select: {
          id: true,
          trackingCode: true,
          status: true,
          totalFare: true,
          cancelledBy: true,
          cancellationReason: true,
          createdAt: true,
          customer: { select: { id: true, name: true, phone: true } },
          statusEvents: { orderBy: { createdAt: 'asc' } },
          payment: { select: { method: true, status: true, amount: true } },
          assignments: {
            orderBy: { offeredAt: 'desc' },
            take: 5,
            select: {
              status: true,
              offeredAt: true,
              respondedAt: true,
              riderProfile: { select: { user: { select: { name: true, phone: true } } } },
            },
          },
        },
      });
      if (!delivery) throw notFound('Delivery not found');
      return ok(res, { kind: 'DELIVERY', order: delivery });
    }

    if (kind === 'trip') {
      const trip = await prisma.rideTrip.findUnique({
        where: { id },
        select: {
          id: true,
          tripCode: true,
          status: true,
          totalFare: true,
          cancelledBy: true,
          cancellationReason: true,
          createdAt: true,
          passenger: { select: { id: true, name: true, phone: true } },
          statusEvents: { orderBy: { createdAt: 'asc' } },
          payment: { select: { method: true, status: true, amount: true } },
          assignments: {
            orderBy: { offeredAt: 'desc' },
            take: 5,
            select: {
              status: true,
              offeredAt: true,
              respondedAt: true,
              driverProfile: { select: { user: { select: { name: true, phone: true } } } },
            },
          },
        },
      });
      if (!trip) throw notFound('Ride trip not found');
      return ok(res, { kind: 'RIDE', order: trip });
    }

    throw badRequest('kind must be "delivery" or "trip"');
  })
);

// GET /admin/activity — recent platform-wide activity feed for the dashboard.
monitoringRouter.get(
  '/activity',
  asyncHandler(async (_req, res) => {
    const [users, auditLogs, deliveries, trips, payments, tickets, suspicious] = await Promise.all([
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: { id: true, name: true, role: true, createdAt: true },
      }),
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: {
          id: true,
          action: true,
          entity: true,
          createdAt: true,
          actor: { select: { name: true, role: true } },
        },
      }),
      prisma.delivery.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: {
          id: true,
          trackingCode: true,
          status: true,
          totalFare: true,
          createdAt: true,
          customer: { select: { name: true } },
        },
      }),
      prisma.rideTrip.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: {
          id: true,
          tripCode: true,
          status: true,
          totalFare: true,
          createdAt: true,
          passenger: { select: { name: true } },
        },
      }),
      prisma.payment.findMany({
        where: { status: 'PAID' },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          amount: true,
          method: true,
          updatedAt: true,
          delivery: { select: { trackingCode: true } },
        },
      }),
      prisma.supportTicket.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          subject: true,
          status: true,
          createdAt: true,
          requester: { select: { name: true } },
        },
      }),
      prisma.suspiciousActivity.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, type: true, severity: true, createdAt: true },
      }),
    ]);

    const events: ActivityEvent[] = [
      ...users.map((user) => ({
        id: `user-${user.id}`,
        type: 'REGISTRATION',
        title: `${user.name} registered`,
        detail: user.role,
        at: user.createdAt,
      })),
      ...auditLogs.map((log) => ({
        id: `audit-${log.id}`,
        type: log.action,
        title: `${log.actor?.name ?? 'Someone'} · ${log.action.replaceAll('_', ' ').toLowerCase()}`,
        detail: log.actor?.role ?? log.entity,
        at: log.createdAt,
      })),
      ...deliveries.map((delivery) => ({
        id: `delivery-${delivery.id}`,
        type: 'DELIVERY',
        title: `${delivery.customer.name} requested delivery ${delivery.trackingCode}`,
        detail: `${delivery.status} · GHS ${delivery.totalFare}`,
        at: delivery.createdAt,
      })),
      ...trips.map((trip) => ({
        id: `trip-${trip.id}`,
        type: 'RIDE',
        title: `${trip.passenger.name} booked ride ${trip.tripCode}`,
        detail: `${trip.status} · GHS ${trip.totalFare}`,
        at: trip.createdAt,
      })),
      ...payments.map((payment) => ({
        id: `payment-${payment.id}`,
        type: 'PAYMENT',
        title: `Payment received (${payment.method})`,
        detail: `GHS ${payment.amount} · ${payment.delivery.trackingCode}`,
        at: payment.updatedAt,
      })),
      ...tickets.map((ticket) => ({
        id: `support-${ticket.id}`,
        type: 'SUPPORT',
        title: `${ticket.requester.name} opened a ticket`,
        detail: `${ticket.subject} · ${ticket.status}`,
        at: ticket.createdAt,
      })),
      ...suspicious.map((event) => ({
        id: `risk-${event.id}`,
        type: 'RISK',
        title: `Suspicious activity: ${event.type}`,
        detail: event.severity,
        at: event.createdAt,
      })),
    ];

    return ok(res, sortEventsDesc(events, ACTIVITY_FEED_LIMIT));
  })
);
