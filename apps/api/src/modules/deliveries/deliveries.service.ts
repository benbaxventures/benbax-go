import { DeliveryCategory, DeliveryStatus, Prisma } from '@prisma/client';
import { nanoid } from 'nanoid';
import { prisma } from '../../config/prisma';
import { notFound } from '../../utils/http';
import { estimateDelivery } from '../dispatch/dispatch.engine';

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

export async function quoteDelivery(input: Pick<CreateDeliveryInput, 'category' | 'pickup' | 'dropoff'>) {
  const quote = estimateDelivery(input.pickup, input.dropoff, input.category);
  return {
    ...quote,
    currency: 'GHS' as const
  };
}

export async function createDelivery(input: CreateDeliveryInput) {
  const quote = await quoteDelivery(input);

  return prisma.delivery.create({
    data: {
      trackingCode: `BBX-${nanoid(8).toUpperCase()}`,
      customerId: input.customerId,
      category: input.category,
      status: DeliveryStatus.REQUESTED,
      pickupLabel: input.pickup.label,
      pickupAddress: input.pickup.address,
      pickupLatitude: new Prisma.Decimal(input.pickup.latitude),
      pickupLongitude: new Prisma.Decimal(input.pickup.longitude),
      pickupLandmark: input.pickup.landmark,
      pickupVoiceNoteUrl: input.pickup.voiceNoteUrl,
      pickupWhatsappUrl: input.pickup.whatsappLocationUrl,
      dropoffLabel: input.dropoff.label,
      dropoffAddress: input.dropoff.address,
      dropoffLatitude: new Prisma.Decimal(input.dropoff.latitude),
      dropoffLongitude: new Prisma.Decimal(input.dropoff.longitude),
      dropoffLandmark: input.dropoff.landmark,
      dropoffVoiceNoteUrl: input.dropoff.voiceNoteUrl,
      dropoffWhatsappUrl: input.dropoff.whatsappLocationUrl,
      recipientName: input.recipientName ?? input.dropoff.contactName,
      recipientPhone: input.recipientPhone ?? input.dropoff.contactPhone,
      scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : undefined,
      distanceKm: quote.distanceKm,
      etaMinutes: quote.estimatedMinutes,
      baseFare: quote.baseFare,
      serviceFee: quote.serviceFee,
      surgeMultiplier: quote.surgeMultiplier,
      totalFare: quote.total,
      notes: input.notes,
      payment: input.paymentMethod
        ? {
            create: {
              method: input.paymentMethod,
              amount: quote.total,
              currency: 'GHS'
            }
          }
        : undefined,
      chatThread: { create: {} }
    },
    include: {
      payment: true,
      assignments: true
    }
  });
}

export async function listCustomerDeliveries(customerId: string) {
  return prisma.delivery.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { payment: true, assignments: { take: 1, orderBy: { offeredAt: 'desc' } } }
  });
}

export async function getDelivery(id: string, requesterId: string) {
  const delivery = await prisma.delivery.findFirst({
    where: {
      id,
      OR: [
        { customerId: requesterId },
        { assignments: { some: { riderProfile: { userId: requesterId } } } }
      ]
    },
    include: {
      payment: true,
      proof: true,
      trackingPoints: { orderBy: { capturedAt: 'desc' }, take: 25 },
      assignments: {
        include: { riderProfile: { include: { user: true, vehicle: true } } },
        orderBy: { offeredAt: 'desc' }
      }
    }
  });

  if (!delivery) throw notFound('Delivery not found');
  return delivery;
}

export async function updateDeliveryStatus(id: string, status: DeliveryStatus) {
  return prisma.delivery.update({
    where: { id },
    data: { status }
  });
}
