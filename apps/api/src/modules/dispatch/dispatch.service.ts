import { Prisma } from '@prisma/client';
import type { Server } from 'socket.io';
import { prisma } from '../../config/prisma';
import { realtimeEvents } from '../../realtime/events';
import { notify } from '../notifications/notify';
import { recordDeliveryStatusEvent, recordTripStatusEvent } from '../orders/status-events';
import { rankRiders } from './dispatch.engine';

export async function dispatchRide(tripId: string, io?: Server) {
  const trip = await prisma.rideTrip.findUnique({ where: { id: tripId } });
  if (!trip) return;

  const drivers = await prisma.driverProfile.findMany({
    where: {
      isOnline: true,
      status: 'ACTIVE',
      currentLatitude: { not: null },
      currentLongitude: { not: null },
    },
    take: 25,
  });

  if (!drivers.length) {
    const noDriverUpdate = {
      ...trip,
      dispatchStatus: 'NO_AVAILABLE_DRIVERS',
    };
    io?.to(`user:${trip.passengerId}`).emit(realtimeEvents.rideUpdated, noDriverUpdate);
    io?.to(`ride:${trip.id}`).emit(realtimeEvents.rideUpdated, noDriverUpdate);
    return;
  }

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
  if (!best) return;

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

  await recordTripStatusEvent(trip.id, {
    fromStatus: trip.status,
    toStatus: 'ASSIGNING',
    note: `Offered to ${assignment.driverProfile.user.name}`,
  });

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
      body: 'A nearby passenger is waiting. Open the app to accept or reject.',
      data: { type: 'ride-offer', assignmentId: assignment.id, tripId: trip.id },
    }
  );
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
      delivery: true,
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
