import { Router } from 'express';
import { PaymentMethod, RideTripStatus, UserRole } from '@prisma/client';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { created, ok } from '../../utils/response';
import { dispatchRide } from '../dispatch/dispatch.service';
import { realtimeEvents } from '../../realtime/events';
import * as service from './rides.service';

export const ridesRouter = Router();

const addressSchema = z.object({
  label: z.string().min(2),
  address: z.string().optional(),
  latitude: z.number(),
  longitude: z.number(),
  landmark: z.string().optional()
});

const quoteSchema = z.object({
  body: z.object({
    pickup: addressSchema,
    dropoff: addressSchema,
    requestedVehicleType: z.string().optional()
  })
});

const createSchema = z.object({
  body: quoteSchema.shape.body.extend({
    scheduledFor: z.string().datetime().optional(),
    notes: z.string().max(500).optional(),
    paymentMethod: z.nativeEnum(PaymentMethod).optional()
  })
});

const statusSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ status: z.nativeEnum(RideTripStatus) })
});

ridesRouter.use(requireAuth);

ridesRouter.post(
  '/quote',
  validate(quoteSchema),
  asyncHandler(async (req, res) => ok(res, await service.quoteRide(req.body)))
);

ridesRouter.post(
  '/',
  requireRoles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.OPERATIONS),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const trip = await service.createRide({
      ...req.body,
      passengerId: req.user!.id
    });
    const io = req.app.get('io');
    io?.to(`user:${trip.passengerId}`).emit(realtimeEvents.rideRequested, trip);
    io?.to(`ride:${trip.id}`).emit(realtimeEvents.rideUpdated, trip);
    io?.to('admins').emit(realtimeEvents.rideRequested, trip);
    void dispatchRide(trip.id, io);
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
  asyncHandler(async (req, res) => ok(res, await service.updateRideStatus(req.params.id!, req.body.status)))
);
