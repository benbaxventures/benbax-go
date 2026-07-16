import { PaymentMethod, RideTripStatus, UserRole } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { realtimeEvents } from '../../realtime/events';
import { asyncHandler } from '../../utils/asyncHandler';
import { created, ok } from '../../utils/response';
import { dispatchRide } from '../dispatch/dispatch.service';
import * as service from './rides.service';

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
    const scheduledTime = trip.scheduledFor?.getTime();
    if (scheduledTime && scheduledTime > Date.now()) {
      setTimeout(
        () => {
          void dispatchRide(trip.id, io);
        },
        Math.min(scheduledTime - Date.now(), 2_147_483_647)
      );
    } else {
      void dispatchRide(trip.id, io);
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
    return ok(res, trip);
  })
);
