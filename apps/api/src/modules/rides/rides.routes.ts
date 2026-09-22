import { PaymentMethod, RideTripStatus, UserRole } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { realtimeEvents } from '../../realtime/events';
import { asyncHandler } from '../../utils/asyncHandler';
import { created, ok } from '../../utils/response';
import { clearRideDispatchState, dispatchRide } from '../dispatch/dispatch.service';
import {
  broadcastOpenRideRequest,
  broadcastRideRequestClosed,
} from '../ride-dispatch/ride-marketplace';
import * as service from './rides.service';

/** Scheduled rides are only pushed to drivers once pickup is this close. */
const SCHEDULED_BROADCAST_AHEAD_MS = 30 * 60 * 1000;

export const ridesRouter = Router();

const addressSchema = z.object({
  label: z.string().min(2),
  address: z.string().optional(),
  latitude: z.number(),
  longitude: z.number(),
  landmark: z.string().optional(),
});

const quoteSchema = z.object({
  body: z.object({
    pickup: addressSchema,
    dropoff: addressSchema,
    requestedVehicleType: z.string().optional(),
  }),
});

const createSchema = z.object({
  body: quoteSchema.shape.body.extend({
    scheduledFor: z.string().datetime().optional(),
    notes: z.string().max(500).optional(),
    paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  }),
});

const statusSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ status: z.nativeEnum(RideTripStatus) }),
});

const rideActionSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

const cancelSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({ reason: z.string().max(300).optional() })
    .optional()
    .default({}),
});

ridesRouter.use(requireAuth);

ridesRouter.post(
  '/quote',
  validate(quoteSchema),
  asyncHandler(async (req, res) => ok(res, await service.quoteRide(req.body)))
);

ridesRouter.post(
  '/',
  // Any authenticated end user can request a ride as a passenger. Drivers and
  // riders are people too, so a phone number registered on another app must not
  // be blocked from booking (previously returned 403 "Permission denied").
  requireRoles(
    UserRole.CUSTOMER,
    UserRole.RIDER,
    UserRole.DRIVER,
    UserRole.ADMIN,
    UserRole.OPERATIONS
  ),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const trip = await service.createRide({
      ...req.body,
      passengerId: req.user!.id,
    });
    const io = req.app.get('io');
    io?.to(`user:${trip.passengerId}`).emit(realtimeEvents.rideRequested, trip);
    io?.to(`ride:${trip.id}`).emit(realtimeEvents.rideUpdated, trip);
    io?.to('admins').emit(realtimeEvents.rideRequested, trip);

    // Every online driver sees the request immediately, wherever they are.
    // Scheduled rides are picked up by the dispatch sweeper once pickup nears.
    const scheduledTime = trip.scheduledFor?.getTime();
    if (!scheduledTime || scheduledTime - Date.now() <= SCHEDULED_BROADCAST_AHEAD_MS) {
      void broadcastOpenRideRequest(io, trip.id).catch((error) =>
        console.error('[api] broadcast of new ride request failed', { tripId: trip.id, error })
      );
    }
    if (!scheduledTime || scheduledTime <= Date.now()) {
      void dispatchRide(trip.id, io).catch((error) =>
        console.error('[api] dispatch of new ride failed', { tripId: trip.id, error })
      );
    }
    return created(res, trip);
  })
);

ridesRouter.get(
  '/',
  asyncHandler(async (req, res) => ok(res, await service.listPassengerRides(req.user!.id)))
);

ridesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => ok(res, await service.getRide(req.params.id!, req.user!.id)))
);

ridesRouter.post(
  '/:id/arrived',
  requireRoles(UserRole.DRIVER),
  validate(rideActionSchema),
  asyncHandler(async (req, res) => {
    const trip = await service.updateDriverRideStatus(
      req.params.id!,
      RideTripStatus.ARRIVED,
      req.user!.id
    );
    const io = req.app.get('io');
    io?.to(`ride:${trip.id}`).emit(realtimeEvents.rideUpdated, trip);
    io?.to(`user:${trip.passengerId}`).emit(realtimeEvents.rideUpdated, trip);
    io?.to('admins').emit(realtimeEvents.rideUpdated, trip);
    return ok(res, trip);
  })
);

ridesRouter.post(
  '/:id/start',
  requireRoles(UserRole.DRIVER),
  validate(rideActionSchema),
  asyncHandler(async (req, res) => {
    const trip = await service.updateDriverRideStatus(
      req.params.id!,
      RideTripStatus.IN_PROGRESS,
      req.user!.id
    );
    const io = req.app.get('io');
    io?.to(`ride:${trip.id}`).emit(realtimeEvents.rideUpdated, trip);
    io?.to(`user:${trip.passengerId}`).emit(realtimeEvents.rideUpdated, trip);
    io?.to('admins').emit(realtimeEvents.rideUpdated, trip);
    return ok(res, trip);
  })
);

ridesRouter.post(
  '/:id/complete',
  requireRoles(UserRole.DRIVER),
  validate(rideActionSchema),
  asyncHandler(async (req, res) => {
    const trip = await service.updateDriverRideStatus(
      req.params.id!,
      RideTripStatus.COMPLETED,
      req.user!.id
    );
    const io = req.app.get('io');
    io?.to(`ride:${trip.id}`).emit(realtimeEvents.rideUpdated, trip);
    io?.to(`user:${trip.passengerId}`).emit(realtimeEvents.rideUpdated, trip);
    io?.to('admins').emit(realtimeEvents.rideUpdated, trip);
    return ok(res, trip);
  })
);

ridesRouter.patch(
  '/:id/status',
  requireRoles(UserRole.DRIVER, UserRole.ADMIN, UserRole.OPERATIONS),
  validate(statusSchema),
  asyncHandler(async (req, res) =>
    ok(res, await service.updateRideStatus(req.params.id!, req.body.status, req.user!.id))
  )
);

ridesRouter.post(
  '/:id/cancel',
  validate(cancelSchema),
  asyncHandler(async (req, res) => {
    const trip = await service.cancelRide(req.params.id!, req.user!, req.body?.reason);
    const io = req.app.get('io');
    io?.to(`ride:${trip.id}`).emit(realtimeEvents.rideUpdated, trip);
    io?.to(`user:${trip.passengerId}`).emit(realtimeEvents.rideUpdated, trip);
    io?.to('admins').emit(realtimeEvents.rideUpdated, trip);
    // Pull the request off every driver's open list / pending offer card.
    broadcastRideRequestClosed(io, trip.id, 'cancelled');
    clearRideDispatchState(trip.id);
    return ok(res, trip);
  })
);
