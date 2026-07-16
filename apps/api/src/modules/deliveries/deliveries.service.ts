import type { DeliveryCategory, UserRole } from '@prisma/client';
import { CancelActor, DeliveryStatus, Prisma } from '@prisma/client';
import { nanoid } from 'nanoid';
import { prisma } from '../../config/prisma';
import { badRequest, forbidden, notFound } from '../../utils/http';
import { estimateDelivery } from '../dispatch/dispatch.engine';
import { recordDeliveryStatusEvent } from '../orders/status-events';
import { buildExpectedRoute } from '../tracking/routeSafety';

const CANCELLABLE_STATUSES: DeliveryStatus[] = [
  DeliveryStatus.DRAFT,
  DeliveryStatus.REQUESTED,
  DeliveryStatus.ASSIGNING,
  DeliveryStatus.ASSIGNED,
  DeliveryStatus.PICKING_UP,
];

type CoordinateInput = {
  label: string;
  address?: string;
  latitude: number;
  longitude: number;
  landmark?: string;
  voiceNoteUrl?: string;
  whatsappLocationUrl?: string;
  contactName?: string;
  contactPhone?: string;
};

type CreateDeliveryInput = {
  customerId: string;
  category: DeliveryCategory;
  pickup: CoordinateInput;
  dropoff: CoordinateInput;
  scheduledFor?: string;
  recipientName?: string;
  recipientPhone?: string;
  notes?: string;
  paymentMethod?: 'MTN_MOMO' | 'PAYSTACK_CARD' | 'WALLET' | 'CASH_ON_DELIVERY';
};

export async function quoteDelivery(
  input: Pick<CreateDeliveryInput, 'category' | 'pickup' | 'dropoff'>
) {
  const quote = estimateDelivery(input.pickup, input.dropoff, input.category);
  return {
    ...quote,
    currency: 'GHS' as const,
  };
}

export async function createDelivery(input: CreateDeliveryInput) {
  const quote = await quoteDelivery(input);
  const expectedRoute = await buildExpectedRoute(
    { latitude: input.pickup.latitude, longitude: input.pickup.longitude },
    { latitude: input.dropoff.latitude, longitude: input.dropoff.longitude }
  );

  const delivery = await prisma.delivery.create({
    data: {
      trackingCode: `BBX-${nanoid(8).toUpperCase()}`,
      customerId: input.customerId,
      category: input.category,
      status: DeliveryStatus.REQUESTED,
      pickupLabel: input.pickup.label,
      pickupAddress: input.pickup.address ?? null,
      pickupLatitude: new Prisma.Decimal(input.pickup.latitude),
      pickupLongitude: new Prisma.Decimal(input.pickup.longitude),
      pickupLandmark: input.pickup.landmark ?? null,
      pickupVoiceNoteUrl: input.pickup.voiceNoteUrl ?? null,
      pickupWhatsappUrl: input.pickup.whatsappLocationUrl ?? null,
      dropoffLabel: input.dropoff.label,
      dropoffAddress: input.dropoff.address ?? null,
      dropoffLatitude: new Prisma.Decimal(input.dropoff.latitude),
      dropoffLongitude: new Prisma.Decimal(input.dropoff.longitude),
      dropoffLandmark: input.dropoff.landmark ?? null,
      dropoffVoiceNoteUrl: input.dropoff.voiceNoteUrl ?? null,
      dropoffWhatsappUrl: input.dropoff.whatsappLocationUrl ?? null,
      recipientName: input.recipientName ?? input.dropoff.contactName ?? null,
      recipientPhone: input.recipientPhone ?? input.dropoff.contactPhone ?? null,
      ...(input.scheduledFor ? { scheduledFor: new Date(input.scheduledFor) } : {}),
      distanceKm: quote.distanceKm,
      etaMinutes: quote.estimatedMinutes,
      baseFare: quote.baseFare,
      serviceFee: quote.serviceFee,
      surgeMultiplier: quote.surgeMultiplier,
      totalFare: quote.total,
      notes: input.notes ?? null,
      metadata: { expectedRoute },
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
      chatThread: { create: {} },
    },
    include: {
      payment: true,
      assignments: true,
    },
  });

  await recordDeliveryStatusEvent(delivery.id, {
    fromStatus: null,
    toStatus: DeliveryStatus.REQUESTED,
    actorId: input.customerId,
    note: 'Delivery requested',
  });

  return delivery;
}

export async function listCustomerDeliveries(customerId: string) {
  return prisma.delivery.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { payment: true, assignments: { take: 1, orderBy: { offeredAt: 'desc' } } },
  });
}

export async function getDelivery(id: string, requesterId: string) {
  const delivery = await prisma.delivery.findFirst({
    where: {
      id,
      OR: [
        { customerId: requesterId },
        { assignments: { some: { riderProfile: { userId: requesterId } } } },
      ],
    },
    include: {
      payment: true,
      proof: true,
      trackingPoints: { orderBy: { capturedAt: 'desc' }, take: 25 },
      assignments: {
        include: { riderProfile: { include: { user: true, vehicle: true } } },
        orderBy: { offeredAt: 'desc' },
      },
    },
  });

  if (!delivery) throw notFound('Delivery not found');
  return delivery;
}

export async function updateDeliveryStatus(id: string, status: DeliveryStatus, actorId?: string) {
  const current = await prisma.delivery.findUnique({ where: { id }, select: { status: true } });
  if (!current) throw notFound('Delivery not found');

  const updated = await prisma.delivery.update({
    where: { id },
    data: { status },
  });

  if (current.status !== status) {
    await recordDeliveryStatusEvent(id, {
      fromStatus: current.status,
      toStatus: status,
      actorId: actorId ?? null,
    });
  }

  return updated;
}

function resolveCancelActor(
  requester: { id: string; role: UserRole },
  ownerId: string
): CancelActor {
  if (requester.id === ownerId) return CancelActor.CUSTOMER;
  if (
    requester.role === 'ADMIN' ||
    requester.role === 'OPERATIONS' ||
    requester.role === 'SUPPORT'
  ) {
    return CancelActor.ADMIN;
  }
  if (requester.role === 'RIDER') return CancelActor.RIDER;
  if (requester.role === 'DRIVER') return CancelActor.DRIVER;
  return CancelActor.SYSTEM;
}

export async function cancelDelivery(
  id: string,
  requester: { id: string; role: UserRole },
  reason?: string
) {
  const delivery = await prisma.delivery.findUnique({
    where: { id },
    include: {
      assignments: {
        where: { status: { in: ['OFFERED', 'ACCEPTED'] } },
        include: { riderProfile: { select: { id: true, userId: true } } },
      },
    },
  });
  if (!delivery) throw notFound('Delivery not found');

  const isOwner = delivery.customerId === requester.id;
  const isStaff =
    requester.role === 'ADMIN' || requester.role === 'OPERATIONS' || requester.role === 'SUPPORT';
  const isAssignedRider = delivery.assignments.some(
    (assignment) => assignment.riderProfile.userId === requester.id
  );
  if (!isOwner && !isStaff && !isAssignedRider) {
    throw forbidden('You cannot cancel this delivery');
  }

  if (delivery.status === DeliveryStatus.CANCELLED) return delivery;
  if (!CANCELLABLE_STATUSES.includes(delivery.status)) {
    throw badRequest(`Delivery can no longer be cancelled (status: ${delivery.status})`);
  }

  const cancelledBy = resolveCancelActor(requester, delivery.customerId);

  const updated = await prisma.$transaction(async (tx) => {
    // Release the rider and expire any open offers so they can take new jobs.
    for (const assignment of delivery.assignments) {
      await tx.deliveryAssignment.update({
        where: { id: assignment.id },
        data: { status: 'EXPIRED', respondedAt: assignment.respondedAt ?? new Date() },
      });
      await tx.riderProfile.update({
        where: { id: assignment.riderProfile.id },
        data: { status: 'ACTIVE' },
      });
    }
    return tx.delivery.update({
      where: { id },
      data: {
        status: DeliveryStatus.CANCELLED,
        cancelledBy,
        cancellationReason: reason ?? null,
      },
    });
  });

  await recordDeliveryStatusEvent(id, {
    fromStatus: delivery.status,
    toStatus: DeliveryStatus.CANCELLED,
    actorId: requester.id,
    note: reason ? `Cancelled by ${cancelledBy}: ${reason}` : `Cancelled by ${cancelledBy}`,
  });

  return updated;
}
