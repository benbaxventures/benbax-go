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
      metadata: input.metadata
    },
    {
      headers: {
        Authorization: `Bearer ${getPaystackSecretKey()}`,
        'Content-Type': 'application/json'
      }
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
      Authorization: `Bearer ${getPaystackSecretKey()}`
    }
  });

  return response.data.data;
}
