import { PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';

/**
 * Wallet ledger entry types. The wallet balance represents money the platform
 * owes the user (withdrawable) — it can go negative when a driver owes
 * commission on cash trips they have already collected in person.
 */
export const WalletTxType = {
  TOPUP: 'TOPUP',
  TRIP_EARNING: 'TRIP_EARNING',
  TRIP_PAYMENT: 'TRIP_PAYMENT',
  COMMISSION: 'COMMISSION',
  WITHDRAWAL: 'WITHDRAWAL',
  WITHDRAWAL_REVERSAL: 'WITHDRAWAL_REVERSAL',
} as const;

/** Methods where the passenger pays through the platform (not cash-in-hand). */
const DIGITAL_METHODS: PaymentMethod[] = [
  PaymentMethod.WALLET,
  PaymentMethod.PAYSTACK_CARD,
  PaymentMethod.MTN_MOMO,
];

export function commissionRate() {
  return env.PLATFORM_COMMISSION_RATE;
}

/** Deterministic ledger reference so settlement is idempotent per trip. */
function settlementReference(tripId: string) {
  return `TRIP-SETTLE-${tripId}`;
}

async function ensureWallet(tx: Prisma.TransactionClient, userId: string) {
  const existing = await tx.wallet.findUnique({ where: { userId } });
  if (existing) return existing;
  return tx.wallet.create({ data: { userId } });
}

export type SettlementResult =
  | { settled: false; reason: 'not_found' | 'no_driver' | 'already_settled' }
  | {
      settled: true;
      method: PaymentMethod;
      isDigital: boolean;
      gross: string;
      commission: string;
      net: string;
    };

/**
 * Settle a completed ride trip. Idempotent: safe to call more than once.
 *
 * - Digital (wallet/card/MoMo): the platform collected the fare, so the driver
 *   wallet is credited the net (fare − commission). Wallet-paid trips also debit
 *   the passenger wallet by the gross fare.
 * - Cash: the driver already holds the full fare, so their wallet is debited the
 *   commission they owe the platform.
 */
export async function settleRideTrip(tripId: string): Promise<SettlementResult> {
  return prisma.$transaction(async (tx) => {
    const trip = await tx.rideTrip.findUnique({
      where: { id: tripId },
      include: {
        payment: true,
        assignments: {
          where: { status: 'ACCEPTED' },
          include: { driverProfile: { select: { id: true, userId: true } } },
          orderBy: { respondedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!trip) return { settled: false, reason: 'not_found' };

    const ref = settlementReference(trip.id);
    const alreadySettled = await tx.walletTransaction.findFirst({ where: { reference: ref } });
    if (alreadySettled) return { settled: false, reason: 'already_settled' };

    const assignment = trip.assignments[0];
    if (!assignment) return { settled: false, reason: 'no_driver' };

    const driverUserId = assignment.driverProfile.userId;
    const driverProfileId = assignment.driverProfileId;

    const gross = new Prisma.Decimal(trip.totalFare);
    const commission = gross.mul(commissionRate()).toDecimalPlaces(2);
    const net = gross.sub(commission);

    const method = trip.payment?.method ?? PaymentMethod.CASH_ON_DELIVERY;
    const isDigital = DIGITAL_METHODS.includes(method);

    const metadata: Prisma.InputJsonObject = {
      tripId: trip.id,
      tripCode: trip.tripCode,
      gross: gross.toString(),
      commission: commission.toString(),
      net: net.toString(),
      method,
    };

    // Mark the ride payment PAID (create a cash record if none exists yet).
    if (trip.payment) {
      await tx.ridePayment.update({
        where: { id: trip.payment.id },
        data: { status: PaymentStatus.PAID },
      });
    } else {
      await tx.ridePayment.create({
        data: {
          tripId: trip.id,
          method: PaymentMethod.CASH_ON_DELIVERY,
          status: PaymentStatus.PAID,
          amount: gross,
          currency: 'GHS',
        },
      });
    }

    const driverWallet = await ensureWallet(tx, driverUserId);

    if (isDigital) {
      if (method === PaymentMethod.WALLET) {
        const passengerWallet = await ensureWallet(tx, trip.passengerId);
        await tx.wallet.update({
          where: { id: passengerWallet.id },
          data: { balance: { decrement: gross } },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: passengerWallet.id,
            type: WalletTxType.TRIP_PAYMENT,
            amount: gross.neg(),
            reference: ref,
            metadata,
          },
        });
      }

      await tx.wallet.update({
        where: { id: driverWallet.id },
        data: { balance: { increment: net } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: driverWallet.id,
          type: WalletTxType.TRIP_EARNING,
          amount: net,
          reference: ref,
          metadata,
        },
      });
    } else {
      await tx.wallet.update({
        where: { id: driverWallet.id },
        data: { balance: { decrement: commission } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: driverWallet.id,
          type: WalletTxType.COMMISSION,
          amount: commission.neg(),
          reference: ref,
          metadata,
        },
      });
    }

    await tx.driverProfile.update({
      where: { id: driverProfileId },
      data: { totalTrips: { increment: 1 }, status: 'ACTIVE' },
    });

    return {
      settled: true,
      method,
      isDigital,
      gross: gross.toString(),
      commission: commission.toString(),
      net: net.toString(),
    };
  });
}
