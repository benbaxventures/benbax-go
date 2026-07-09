import { Prisma, UserRole } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { requireAuth, requireRoles } from '../../middleware/auth';
import { realtimeEvents } from '../../realtime/events';
import { asyncHandler } from '../../utils/asyncHandler';
import { badRequest, notFound } from '../../utils/http';
import { ok } from '../../utils/response';
import { rankRiders } from '../dispatch/dispatch.engine';
import { sendExpoPushToUser } from '../notifications/push';

export const rideDispatchRouter = Router();

rideDispatchRouter.use(requireAuth);

rideDispatchRouter.post(
  '/trips/:id/assign',
  requireRoles(UserRole.ADMIN, UserRole.OPERATIONS),
  asyncHandler(async (req, res) => {
    const tripId = req.params.id;
    if (!tripId) throw badRequest('Trip id is required');

    const trip = await prisma.rideTrip.findUnique({ where: { id: tripId } });
    if (!trip) throw notFound('Ride trip not found');

    const drivers = await prisma.driverProfile.findMany({
      where: {
        isOnline: true,
        status: 'ACTIVE',
        currentLatitude: { not: null },
        currentLongitude: { not: null },
      },
      take: 25,
    });

    if (!drivers.length) throw badRequest('No available drivers near pickup');

    const ranked = rankRiders(
      {
        latitude: Number(trip.pickupLatitude),
        longitude: Number(trip.pickupLongitude),
      },
      drivers.map((driver) => ({
        id: driver.id,
        latitude: Number(driver.currentLatitude),
        longitude: Number(driver.currentLongitude),
        rating: Number(driver.rating),
        activeDeliveries: driver.status === 'ON_TRIP' ? 1 : 0,
        lastLocationAgeSeconds: driver.lastLocationAt
          ? Math.floor((Date.now() - driver.lastLocationAt.getTime()) / 1000)
          : 300,
      }))
    );

    const best = ranked[0];
    if (!best) throw badRequest('No ride dispatch candidates could be ranked');

    const assignment = await prisma.rideAssignment.create({
      data: {
        tripId: trip.id,
        driverProfileId: best.riderId,
        score: new Prisma.Decimal(best.score),
        expiresAt: new Date(Date.now() + 45_000),
      },
      include: {
        driverProfile: { include: { user: true, vehicle: true } },
        trip: true,
      },
    });

    const updatedTrip = await prisma.rideTrip.update({
      where: { id: trip.id },
      data: { status: 'ASSIGNING' },
    });

    const io = req.app.get('io');
    io?.to(`driver:${assignment.driverProfile.userId}`).emit(
      realtimeEvents.driverOffer,
      assignment
    );
    io?.to(`user:${trip.passengerId}`).emit(realtimeEvents.rideAssigned, assignment);
    io?.to(`ride:${trip.id}`).emit(realtimeEvents.rideAssigned, assignment);
    io?.to(`user:${trip.passengerId}`).emit(realtimeEvents.rideUpdated, updatedTrip);
    io?.to(`ride:${trip.id}`).emit(realtimeEvents.rideUpdated, updatedTrip);
    io?.to('admins').emit(realtimeEvents.rideAssigned, assignment);

    // Push the offer so the driver is alerted even with the app backgrounded.
    void sendExpoPushToUser(assignment.driverProfile.userId, {
      title: 'New ride request',
      body: 'A nearby passenger is waiting. Tap to accept or reject.',
      data: { type: 'ride-offer', assignmentId: assignment.id, tripId: trip.id },
    });

    return ok(res, { assignment, ranked });
  })
);

rideDispatchRouter.post(
  '/assignments/:id/accept',
  requireRoles(UserRole.DRIVER),
  asyncHandler(async (req, res) => {
    const driver = await prisma.driverProfile.findUnique({ where: { userId: req.user!.id } });
    if (!driver) throw notFound('Driver profile not found');
    const assignmentId = req.params.id;
    if (!assignmentId) throw badRequest('Assignment id is required');

    const existing = await prisma.rideAssignment.findFirst({
      where: {
        id: assignmentId,
        driverProfileId: driver.id,
        status: 'OFFERED',
      },
    });
    if (!existing) throw notFound('Ride assignment not found');

    const assignment = await prisma.rideAssignment.update({
      where: { id: assignmentId },
      data: {
        status: 'ACCEPTED',
        respondedAt: new Date(),
        trip: { update: { status: 'ASSIGNED' } },
        driverProfile: { update: { status: 'ON_TRIP' } },
      },
      include: {
        driverProfile: { include: { user: true, vehicle: true } },
        trip: true,
      },
    });

    const io = req.app.get('io');
    io?.to(`ride:${assignment.tripId}`).emit(realtimeEvents.rideAssigned, assignment);
    io?.to(`user:${assignment.trip.passengerId}`).emit(realtimeEvents.rideAssigned, assignment);
    io?.to(`driver:${assignment.driverProfile.userId}`).emit(
      realtimeEvents.rideAssigned,
      assignment
    );
    io?.to('admins').emit(realtimeEvents.rideAssigned, assignment);
    return ok(res, assignment);
  })
);

rideDispatchRouter.post(
  '/assignments/:id/reject',
  requireRoles(UserRole.DRIVER),
  asyncHandler(async (req, res) => {
    const assignmentId = req.params.id;
    if (!assignmentId) throw badRequest('Assignment id is required');

    const driver = await prisma.driverProfile.findUnique({ where: { userId: req.user!.id } });
    if (!driver) throw notFound('Driver profile not found');

    const existing = await prisma.rideAssignment.findFirst({
      where: {
        id: assignmentId,
        driverProfileId: driver.id,
        status: 'OFFERED',
      },
    });
    if (!existing) throw notFound('Ride assignment not found');

    const assignment = await prisma.rideAssignment.update({
      where: { id: assignmentId },
      data: { status: 'REJECTED', respondedAt: new Date() },
    });
    return ok(res, assignment);
  })
);
