import axios from 'axios';
import { env } from '../../config/env';
import { badRequest } from '../../utils/http';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

function getPaystackSecretKey() {
  if (!env.PAYSTACK_SECRET_KEY) throw badRequest('Paystack is not configured');
  return env.PAYSTACK_SECRET_KEY;
}

export async function initializePaystackTransaction(input: {
  email: string;
  amountPesewas: number;
  reference: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}) {
  const response = await axios.post(
    `${PAYSTACK_BASE_URL}/transaction/initialize`,
    {
      email: input.email,
      amount: input.amountPesewas,
      currency: 'GHS',
      reference: input.reference,
      callback_url: input.callbackUrl,
      channels: ['card', 'mobile_money'],
      metadata: input.metadata,
    },
    {
      headers: {
        Authorization: `Bearer ${getPaystackSecretKey()}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data.data as {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export async function verifyPaystackTransaction(reference: string) {
  const response = await axios.get(`${PAYSTACK_BASE_URL}/transaction/verify/${reference}`, {
    headers: {
      Authorization: `Bearer ${getPaystackSecretKey()}`,
    },
  });

  return response.data.data;
}

/** True when automated Paystack Transfers are both enabled and credentialed. */
export function isPaystackTransfersEnabled() {
  return Boolean(env.PAYSTACK_TRANSFERS_ENABLED && env.PAYSTACK_SECRET_KEY);
}

/**
 * Create a Paystack transfer recipient for a mobile-money or bank destination.
 * Returns the `recipient_code` used to initiate transfers.
 */
export async function createTransferRecipient(input: {
  type: 'mobile_money' | 'nuban';
  name: string;
  accountNumber: string;
  bankCode: string;
  currency?: string;
}) {
  const response = await axios.post(
    `${PAYSTACK_BASE_URL}/transferrecipient`,
    {
      type: input.type,
      name: input.name,
      account_number: input.accountNumber,
      bank_code: input.bankCode,
      currency: input.currency ?? 'GHS',
    },
    {
      headers: {
        Authorization: `Bearer ${getPaystackSecretKey()}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data.data as { recipient_code: string; active: boolean };
}

/** Initiate a transfer to a previously created recipient. */
export async function initiateTransfer(input: {
  amountPesewas: number;
  recipient: string;
  reason?: string;
  reference: string;
}) {
  const response = await axios.post(
    `${PAYSTACK_BASE_URL}/transfer`,
    {
      source: 'balance',
      amount: input.amountPesewas,
      recipient: input.recipient,
      reason: input.reason,
      reference: input.reference,
      currency: 'GHS',
    },
    {
      headers: {
        Authorization: `Bearer ${getPaystackSecretKey()}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data.data as {
    transfer_code: string;
    status: string;
    reference: string;
  };
}
