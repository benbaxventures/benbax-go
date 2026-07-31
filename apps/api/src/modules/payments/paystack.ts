import axios from 'axios';
import { env } from '../../config/env';
import type { AppError } from '../../utils/http';
import { badGateway, badRequest } from '../../utils/http';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

function getPaystackSecretKey() {
  if (!env.PAYSTACK_SECRET_KEY) throw badRequest('Paystack is not configured');
  return env.PAYSTACK_SECRET_KEY;
}

// Paystack returns the real failure reason (e.g. "Currency not supported by
// merchant", "Invalid key") in `response.data.message`. Without unwrapping it,
// the raw AxiosError surfaces as a generic "Request failed with status code
// 400" and the actual cause is lost from both the user and the server logs.
function toPaystackError(error: unknown, action: string): AppError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const providerMessage =
      (error.response?.data as { message?: string } | undefined)?.message ?? error.message;

    console.error(`Paystack ${action} failed`, {
      status,
      data: error.response?.data ?? null,
    });

    // A 4xx from Paystack is a request/configuration problem (bad key, currency
    // not enabled, duplicate reference); surface the reason to the caller. A 5xx
    // or a network failure is an upstream outage.
    if (status && status >= 400 && status < 500) {
      return badRequest(`Payment provider error: ${providerMessage}`);
    }
    return badGateway('Payment provider is unavailable. Please try again shortly.');
  }

  console.error(`Paystack ${action} failed`, error);
  return badGateway('Payment provider is unavailable. Please try again shortly.');
}

export async function initializePaystackTransaction(input: {
  email: string;
  amountPesewas: number;
  reference: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
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
  } catch (error) {
    throw toPaystackError(error, 'transaction initialize');
  }
}

export async function verifyPaystackTransaction(reference: string) {
  try {
    const response = await axios.get(`${PAYSTACK_BASE_URL}/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${getPaystackSecretKey()}`,
      },
    });

    return response.data.data;
  } catch (error) {
    throw toPaystackError(error, 'transaction verify');
  }
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
  try {
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
  } catch (error) {
    throw toPaystackError(error, 'create transfer recipient');
  }
}

/** Initiate a transfer to a previously created recipient. */
export async function initiateTransfer(input: {
  amountPesewas: number;
  recipient: string;
  reason?: string;
  reference: string;
}) {
  try {
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
  } catch (error) {
    throw toPaystackError(error, 'initiate transfer');
  }
}
