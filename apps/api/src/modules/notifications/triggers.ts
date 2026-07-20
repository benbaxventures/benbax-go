import {
  DeliveryStatus,
  RideTripStatus,
  UserRole,
  type Delivery,
  type RideTrip,
} from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { ALL_CHANNELS, FREE_CHANNELS, notify, type NotifyChannel } from './notify';

// Staff who watch the operational feed. Kept in one place so every trigger
// notifies the same audience.
const ADMIN_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.OPERATIONS, UserRole.SUPPORT];

const VALID_CHANNELS: NotifyChannel[] = ['inapp', 'push', 'whatsapp', 'sms', 'email'];

// Channels used when broadcasting a new request to the whole fleet: the free
// channels plus any the operator explicitly opted into via env.
const FLEET_BROADCAST_CHANNELS: NotifyChannel[] = Array.from(
  new Set<NotifyChannel>([
    ...FREE_CHANNELS,
    ...env.NOTIFY_FLEET_BROADCAST_CHANNELS.filter((c): c is NotifyChannel =>
      VALID_CHANNELS.includes(c as NotifyChannel)
    ),
  ])
);

// Customer-facing copy for each delivery milestone worth a notification.
const DELIVERY_STATUS_COPY: Partial<Record<DeliveryStatus, { title: string; body: string }>> = {
  [DeliveryStatus.ASSIGNED]: {
    title: 'A rider is on the way',
    body: 'A rider accepted your delivery and is heading to the pickup point.',
  },
  [DeliveryStatus.PICKING_UP]: {
    title: 'Rider is picking up your parcel',
    body: 'Your rider has arrived at the pickup location.',
  },
  [DeliveryStatus.IN_TRANSIT]: {
    title: 'Your delivery is on the move',
    body: 'Your parcel is on its way to the drop-off.',
  },
  [DeliveryStatus.ARRIVED]: {
    title: 'Your rider has arrived',
    body: 'Your rider has reached the drop-off location.',
  },
  [DeliveryStatus.DELIVERED]: {
    title: 'Delivered 🎉',
    body: 'Your delivery is complete. Thanks for riding with Benbax!',
  },
  [DeliveryStatus.CANCELLED]: {
    title: 'Delivery cancelled',
    body: 'Your delivery request was cancelled.',
  },
  [DeliveryStatus.FAILED]: {
    title: 'Delivery could not be completed',
    body: 'We hit a problem completing your delivery. Support will reach out.',
  },
};

// Passenger-facing copy for each ride milestone worth a notification.
const RIDE_STATUS_COPY: Partial<Record<RideTripStatus, { title: string; body: string }>> = {
  [RideTripStatus.ASSIGNED]: {
    title: 'Driver found',
    body: 'A driver accepted your ride and is on the way.',
  },
  [RideTripStatus.DRIVER_ARRIVING]: {
    title: 'Your driver is arriving',
    body: 'Your driver is approaching the pickup point.',
  },
  [RideTripStatus.ARRIVED]: {
    title: 'Your driver has arrived',
    body: 'Your driver is waiting at the pickup point.',
  },
  [RideTripStatus.IN_PROGRESS]: {
    title: 'Trip started',
    body: 'Enjoy your ride. You can share your live trip from the app.',
  },
  [RideTripStatus.COMPLETED]: {
    title: 'Trip complete',
    body: 'Thanks for riding with Benbax! Rate your driver in the app.',
  },
  [RideTripStatus.CANCELLED]: {
    title: 'Ride cancelled',
    body: 'Your ride was cancelled.',
  },
  [RideTripStatus.FAILED]: {
    title: 'Ride could not be completed',
    body: 'We hit a problem with your ride. Support will reach out.',
  },
};

/**
 * A customer just requested a delivery: alert the rider fleet (so any of them
 * can grab it) and the ops team. Free channels by default; SMS/WhatsApp to the
 * whole fleet only when opted in via NOTIFY_FLEET_BROADCAST_CHANNELS.
 */
export function notifyDeliveryRequested(delivery: Delivery): void {
  void notify(
    { roles: [UserRole.RIDER], channels: FLEET_BROADCAST_CHANNELS },
    {
      title: 'New delivery request',
      body: `A ${delivery.category.toLowerCase()} delivery from ${delivery.pickupLabel} is waiting. Open the app to accept.`,
      data: {
        type: 'delivery-requested',
        deliveryId: delivery.id,
        trackingCode: delivery.trackingCode,
      },
    }
  );
  void notify(
    { roles: ADMIN_ROLES, channels: FREE_CHANNELS },
    {
      title: 'New delivery requested',
      body: `${delivery.trackingCode} · ${delivery.category} · from ${delivery.pickupLabel}.`,
      data: { type: 'admin-delivery-requested', deliveryId: delivery.id },
    }
  );
}

/**
 * A passenger just requested a ride: alert the driver fleet and the ops team.
 */
export function notifyRideRequested(trip: RideTrip): void {
  void notify(
    { roles: [UserRole.DRIVER], channels: FLEET_BROADCAST_CHANNELS },
    {
      title: 'New ride request',
      body: `A passenger needs a ride from ${trip.pickupLabel}. Open the app to accept.`,
      data: { type: 'ride-requested', tripId: trip.id, tripCode: trip.tripCode },
    }
  );
  void notify(
    { roles: ADMIN_ROLES, channels: FREE_CHANNELS },
    {
      title: 'New ride requested',
      body: `${trip.tripCode} · from ${trip.pickupLabel}.`,
      data: { type: 'admin-ride-requested', tripId: trip.id },
    }
  );
}

/**
 * A delivery moved to a new status: notify the customer across every channel
 * and keep the ops feed updated. Fetches the delivery by id so it can be fired
 * from the central status-event recorder that every transition funnels through.
 * No-op for statuses without customer-facing copy (e.g. DRAFT/ASSIGNING).
 */
export async function notifyDeliveryStatusChanged(
  deliveryId: string,
  toStatus: DeliveryStatus
): Promise<void> {
  const copy = DELIVERY_STATUS_COPY[toStatus];
  if (!copy) return;

  const delivery = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    select: { id: true, customerId: true, trackingCode: true },
  });
  if (!delivery) return;

  void notify(
    { userIds: [delivery.customerId], channels: ALL_CHANNELS },
    {
      ...copy,
      body: `${copy.body} (Tracking ${delivery.trackingCode})`,
      data: { type: 'delivery-status', deliveryId: delivery.id, status: toStatus },
    }
  );
  void notify(
    { roles: ADMIN_ROLES, channels: FREE_CHANNELS },
    {
      title: `Delivery ${toStatus.toLowerCase().replace(/_/g, ' ')}`,
      body: `${delivery.trackingCode} is now ${toStatus}.`,
      data: { type: 'admin-delivery-status', deliveryId: delivery.id, status: toStatus },
    }
  );
}

/**
 * A ride moved to a new status: notify the passenger and the ops feed. Fetches
 * the trip by id so it can be fired from the central status-event recorder.
 */
export async function notifyRideStatusChanged(
  tripId: string,
  toStatus: RideTripStatus
): Promise<void> {
  const copy = RIDE_STATUS_COPY[toStatus];
  if (!copy) return;

  const trip = await prisma.rideTrip.findUnique({
    where: { id: tripId },
    select: { id: true, passengerId: true, tripCode: true },
  });
  if (!trip) return;

  void notify(
    { userIds: [trip.passengerId], channels: ALL_CHANNELS },
    {
      ...copy,
      body: `${copy.body} (Trip ${trip.tripCode})`,
      data: { type: 'ride-status', tripId: trip.id, status: toStatus },
    }
  );
  void notify(
    { roles: ADMIN_ROLES, channels: FREE_CHANNELS },
    {
      title: `Ride ${toStatus.toLowerCase().replace(/_/g, ' ')}`,
      body: `${trip.tripCode} is now ${toStatus}.`,
      data: { type: 'admin-ride-status', tripId: trip.id, status: toStatus },
    }
  );
}

/**
 * A new customer registered: welcome the drivers (more passengers = more trips)
 * and log it to the ops feed.
 */
export function notifyClientRegistered(user: { id: string; name: string }): void {
  void notify(
    { roles: [UserRole.DRIVER], channels: FREE_CHANNELS, excludeUserId: user.id },
    {
      title: 'New passenger on Benbax',
      body: `${user.name} just joined. More riders means more trips.`,
      data: { type: 'client-registered', clientId: user.id },
    }
  );
  void notify(
    { roles: ADMIN_ROLES, channels: FREE_CHANNELS },
    {
      title: 'New customer registered',
      body: `${user.name} just created an account.`,
      data: { type: 'admin-client-registered', clientId: user.id },
    }
  );
}
