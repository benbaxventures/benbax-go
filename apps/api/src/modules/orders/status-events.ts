import type { DeliveryStatus, RideTripStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { notifyDeliveryStatusChanged, notifyRideStatusChanged } from '../notifications/triggers';

type StatusEventInput<TStatus> = {
  fromStatus: TStatus | null;
  toStatus: TStatus;
  actorId?: string | null;
  note?: string | null;
};

// Status events power the admin order timeline, stuck-order detection, and
// dispute resolution. Recording must never break the order flow itself, so
// failures are logged and swallowed.
export async function recordDeliveryStatusEvent(
  deliveryId: string,
  input: StatusEventInput<DeliveryStatus>
) {
  try {
    await prisma.deliveryStatusEvent.create({
      data: {
        deliveryId,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        actorId: input.actorId ?? null,
        note: input.note ?? null,
      },
    });
  } catch (error) {
    console.error('Failed to record delivery status event', { deliveryId, input, error });
  }

  // Fan the milestone out to the customer (all channels) and the ops feed.
  // Best-effort and self-contained, so it can never break the order flow.
  void notifyDeliveryStatusChanged(deliveryId, input.toStatus);
}

export async function recordTripStatusEvent(
  tripId: string,
  input: StatusEventInput<RideTripStatus>
) {
  try {
    await prisma.tripStatusEvent.create({
      data: {
        tripId,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        actorId: input.actorId ?? null,
        note: input.note ?? null,
      },
    });
  } catch (error) {
    console.error('Failed to record trip status event', { tripId, input, error });
  }

  // Fan the milestone out to the passenger (all channels) and the ops feed.
  void notifyRideStatusChanged(tripId, input.toStatus);
}
