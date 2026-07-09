import {
  PaymentMethod,
  PaymentStatus,
  PayoutMethod,
  PayoutStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import crypto from 'crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { requireAuth, requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { badRequest, notFound, unauthorized } from '../../utils/http';
import { ok } from '../../utils/response';
import {
  createTransferRecipient,
  initializePaystackTransaction,
  initiateTransfer,
  isPaystackTransfersEnabled,
  verifyPaystackTransaction,
} from './paystack';
import { WalletTxType } from './settlement';

export const paymentsRouter = Router();

const initializeSchema = z.object({
  body: z.object({
    deliveryId: z.string(),
    method: z.nativeEnum(PaymentMethod),
    mobileNumber: z.string().optional(),
  }),
});

type PaystackTransaction = {
  status: string;
  reference: string;
  amount: number;
  currency: string;
};

function toPesewas(amount: Prisma.Decimal | number) {
  return Math.round(Number(amount) * 100);
}

function createPaystackReference(trackingCode: string) {
  return `BBX-PAY-${trackingCode}-${Date.now()}`;
}

function verifyWebhookSignature(req: Request) {
  if (!env.PAYSTACK_SECRET_KEY) throw badRequest('Paystack is not configured');

  const signature = req.header('x-paystack-signature');
  if (!signature || !req.rawBody) throw unauthorized('Invalid Paystack signature');

  const expected = crypto
    .createHmac('sha512', env.PAYSTACK_SECRET_KEY)
    .update(req.rawBody)
    .digest('hex');
  const received = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  if (
    received.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(received, expectedBuffer)
  ) {
    throw unauthorized('Invalid Paystack signature');
  }
}

async function markPaystackPayment(reference: string) {
  const payment = await prisma.payment.findFirst({
    where: { provider: 'PAYSTACK', providerRef: reference },
  });
  if (!payment) throw notFound('Payment not found');

  const transaction = (await verifyPaystackTransaction(reference)) as PaystackTransaction;
  const isPaid =
    transaction.status === 'success' &&
    transaction.currency === payment.currency &&
    transaction.amount === toPesewas(payment.amount);

  return prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: isPaid ? PaymentStatus.PAID : PaymentStatus.FAILED,
      metadata: transaction as unknown as Prisma.InputJsonValue,
    },
  });
}

async function markPaystackWalletTopup(reference: string) {
  const wt = await prisma.walletTransaction.findFirst({ where: { reference } });
  if (!wt) throw notFound('Wallet transaction not found');

  const meta = wt.metadata as Record<string, unknown> | null;
  if (meta?.status === 'success') {
    return { wallet: await prisma.wallet.findUnique({ where: { id: wt.walletId } }) };
  }

  const transaction = (await verifyPaystackTransaction(reference)) as PaystackTransaction;
  const isPaid =
    transaction.status === 'success' &&
    transaction.currency === 'GHS' &&
    transaction.amount === toPesewas(wt.amount);

  await prisma.walletTransaction.update({
    where: { id: wt.id },
    data: { metadata: transaction as unknown as Prisma.InputJsonValue },
  });

  if (!isPaid) {
    return null;
  }

  const amount = new Prisma.Decimal(transaction.amount).div(100);
  const wallet = await prisma.wallet.update({
    where: { id: wt.walletId },
    data: { balance: { increment: amount } },
  });

  return { wallet };
}

paymentsRouter.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    verifyWebhookSignature(req);

    if (req.body?.event === 'charge.success' && req.body?.data?.reference) {
      const reference = req.body.data.reference as string;

      // Try marking delivery payment first, otherwise try wallet topup
      const payment = await prisma.payment.findFirst({ where: { providerRef: reference } });
      if (payment) {
        await markPaystackPayment(reference);
      } else {
        const wt = await prisma.walletTransaction.findFirst({ where: { reference } });
        if (wt) {
          await markPaystackWalletTopup(reference);
        }
      }
    }

    return ok(res, { received: true });
  })
);

paymentsRouter.use(requireAuth);

paymentsRouter.post(
  '/initialize',
  validate(initializeSchema),
  asyncHandler(async (req, res) => {
    const delivery = await prisma.delivery.findFirst({
      where: { id: req.body.deliveryId, customerId: req.user!.id },
      include: { payment: true, customer: true },
    });
    if (!delivery) throw notFound('Delivery not found');

    if (delivery.payment?.status === PaymentStatus.PAID) {
      return ok(res, { payment: delivery.payment, nextAction: 'PAYMENT_COMPLETE' });
    }

    const reference =
      req.body.method === PaymentMethod.PAYSTACK_CARD
        ? createPaystackReference(delivery.trackingCode)
        : `BBX-PAY-${delivery.trackingCode}`;

    let payment = await prisma.payment.upsert({
      where: { deliveryId: delivery.id },
      create: {
        deliveryId: delivery.id,
        method: req.body.method,
        mobileNumber: req.body.mobileNumber,
        amount: delivery.totalFare,
        currency: 'GHS',
        provider:
          req.body.method === 'MTN_MOMO'
            ? 'MTN_MOMO'
            : req.body.method === 'PAYSTACK_CARD'
              ? 'PAYSTACK'
              : null,
        providerRef: reference,
      },
      update: {
        method: req.body.method,
        mobileNumber: req.body.mobileNumber,
        provider:
          req.body.method === 'MTN_MOMO'
            ? 'MTN_MOMO'
            : req.body.method === 'PAYSTACK_CARD'
              ? 'PAYSTACK'
              : null,
        providerRef: reference,
      },
    });

    if (req.body.method === PaymentMethod.PAYSTACK_CARD) {
      if (!delivery.customer.email)
        throw badRequest('Customer email is required for Paystack payments');

      const checkout = await initializePaystackTransaction({
        email: delivery.customer.email,
        amountPesewas: toPesewas(delivery.totalFare),
        reference,
        ...(env.PAYSTACK_CALLBACK_URL ? { callbackUrl: env.PAYSTACK_CALLBACK_URL } : {}),
        metadata: {
          paymentId: payment.id,
          deliveryId: delivery.id,
          customerId: delivery.customerId,
          trackingCode: delivery.trackingCode,
        },
      });

      payment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerRef: checkout.reference,
          metadata: {
            authorizationUrl: checkout.authorization_url,
            accessCode: checkout.access_code,
          },
        },
      });

      return ok(res, {
        payment,
        nextAction: 'OPEN_PROVIDER_CHECKOUT',
        checkout: {
          authorizationUrl: checkout.authorization_url,
          accessCode: checkout.access_code,
          reference: checkout.reference,
        },
      });
    }

    return ok(res, {
      payment,
      nextAction:
        req.body.method === 'CASH_ON_DELIVERY'
          ? 'COLLECT_ON_DELIVERY'
          : req.body.method === 'MTN_MOMO'
            ? 'AUTHORIZE_MOBILE_MONEY_PROMPT'
            : 'OPEN_PROVIDER_CHECKOUT',
    });
  })
);

paymentsRouter.post(
  '/verify/:reference',
  asyncHandler(async (req, res) => {
    const reference = req.params.reference;
    if (!reference) throw badRequest('Payment reference is required');

    const payment = await prisma.payment.findFirst({
      where: {
        provider: 'PAYSTACK',
        providerRef: reference,
        delivery: { customerId: req.user!.id },
      },
    });
    if (!payment) throw notFound('Payment not found');

    const updated = await markPaystackPayment(reference);
    return ok(res, { payment: updated });
  })
);

const walletTopupSchema = z.object({ body: z.object({ amount: z.number().positive() }) });

paymentsRouter.post(
  '/wallet-topup',
  validate(walletTopupSchema),
  asyncHandler(async (req, res) => {
    const amount = req.body.amount as number;

    let wallet = await prisma.wallet.findUnique({ where: { userId: req.user!.id } });
    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: { userId: req.user!.id },
        include: { transactions: { orderBy: { createdAt: 'desc' } } },
      });
    }

    const reference = createPaystackReference(`WALLET-${req.user!.id}`);

    const wt = await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'TOPUP',
        amount: amount,
        reference,
      },
    });

    // Load full user record to get email (req.user only contains id + role)
    const customer = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!customer?.email) throw badRequest('Customer email is required for Paystack payments');

    const checkout = await initializePaystackTransaction({
      email: customer.email,
      amountPesewas: toPesewas(amount),
      reference,
      ...(env.PAYSTACK_CALLBACK_URL ? { callbackUrl: env.PAYSTACK_CALLBACK_URL } : {}),
      metadata: {
        walletTransactionId: wt.id,
        walletId: wallet.id,
        userId: req.user!.id,
      },
    });

    await prisma.walletTransaction.update({
      where: { id: wt.id },
      data: {
        reference: checkout.reference,
        metadata: {
          authorizationUrl: checkout.authorization_url,
          accessCode: checkout.access_code,
        },
      },
    });

    return ok(res, {
      walletTransaction: wt,
      nextAction: 'OPEN_PROVIDER_CHECKOUT',
      checkout: {
        authorizationUrl: checkout.authorization_url,
        accessCode: checkout.access_code,
        reference: checkout.reference,
      },
    });
  })
);

paymentsRouter.post(
  '/wallet-verify/:reference',
  asyncHandler(async (req, res) => {
    const reference = req.params.reference;
    if (!reference) throw badRequest('Payment reference is required');

    const result = await markPaystackWalletTopup(reference);
    if (!result) throw badRequest('Payment not confirmed');

    const walletTransaction = await prisma.walletTransaction.findFirst({
      where: { reference },
      include: { wallet: true },
    });

    return ok(res, { walletTransaction, wallet: result.wallet });
  })
);

paymentsRouter.get(
  '/wallet',
  asyncHandler(async (req, res) => {
    let wallet = await prisma.wallet.findUnique({
      where: { userId: req.user!.id },
      include: { transactions: { orderBy: { createdAt: 'desc' } } },
    });
    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: { userId: req.user!.id },
        include: { transactions: { orderBy: { createdAt: 'desc' } } },
      });
    }

    return ok(res, wallet);
  })
);

const instantPayoutSchema = z.object({ body: z.object({ amount: z.number().positive() }) });

paymentsRouter.post(
  '/instant-payout',
  requireRoles(UserRole.DRIVER),
  validate(instantPayoutSchema),
  asyncHandler(async (req, res) => {
    const amount = req.body.amount as number;

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw notFound('User not found');
    if (!user.phone) throw badRequest('A registered phone number is required for MoMo payouts');

    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    const balance = wallet ? Number(wallet.balance) : 0;
    if (!wallet || balance <= 0) throw badRequest('No wallet balance available to withdraw');
    if (amount > balance) throw badRequest('Withdrawal amount exceeds your available balance');

    const amountDec = new Prisma.Decimal(amount);

    // Atomically reserve funds: create the payout and debit the wallet.
    const payout = await prisma.$transaction(async (tx) => {
      const created = await tx.payout.create({
        data: {
          userId: user.id,
          amount: amountDec,
          currency: wallet.currency,
          method: PayoutMethod.MTN_MOMO,
          destination: user.phone,
          accountName: user.name,
          status: PayoutStatus.PENDING,
        },
      });
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amountDec } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTxType.WITHDRAWAL,
          amount: amountDec.neg(),
          reference: `PAYOUT-${created.id}`,
          metadata: { payoutId: created.id },
        },
      });
      return created;
    });

    // Try an automated transfer when enabled; otherwise leave PENDING for an
    // admin to process manually.
    if (isPaystackTransfersEnabled()) {
      try {
        const recipient = await createTransferRecipient({
          type: 'mobile_money',
          name: user.name,
          accountNumber: user.phone,
          bankCode: env.PAYSTACK_MOMO_BANK_CODE,
        });
        const transfer = await initiateTransfer({
          amountPesewas: toPesewas(amountDec),
          recipient: recipient.recipient_code,
          reason: 'Benbax driver payout',
          reference: `PAYOUT-${payout.id}`,
        });
        const updated = await prisma.payout.update({
          where: { id: payout.id },
          data: {
            status: transfer.status === 'success' ? PayoutStatus.PAID : PayoutStatus.PROCESSING,
            provider: 'PAYSTACK',
            providerRef: transfer.transfer_code,
            ...(transfer.status === 'success' ? { processedAt: new Date() } : {}),
          },
        });
        return ok(res, { payout: updated, autoProcessed: true });
      } catch (error) {
        // Refund the wallet and mark the payout failed so no funds are lost.
        await prisma.$transaction(async (tx) => {
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: amountDec } },
          });
          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              type: WalletTxType.WITHDRAWAL_REVERSAL,
              amount: amountDec,
              reference: `PAYOUT-${payout.id}-REVERSAL`,
              metadata: { payoutId: payout.id },
            },
          });
          await tx.payout.update({
            where: { id: payout.id },
            data: {
              status: PayoutStatus.FAILED,
              failureReason: error instanceof Error ? error.message : 'Transfer failed',
            },
          });
        });
        throw badRequest('Automated payout failed. Please try again or contact support.');
      }
    }

    return ok(res, { payout, autoProcessed: false });
  })
);

paymentsRouter.get(
  '/payouts',
  asyncHandler(async (req, res) => {
    const payouts = await prisma.payout.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return ok(res, payouts);
  })
);
