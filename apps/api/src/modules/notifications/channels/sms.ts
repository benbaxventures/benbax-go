import axios from 'axios';
import { env } from '../../../config/env';

/**
 * Sends an SMS through the configured gateway. Best-effort and no-op unless
 * SMS_PROVIDER is set (SMS has no genuinely free tier anywhere, so it stays
 * disabled until you add a paid gateway's credentials).
 *
 * Providers:
 *  - hubtel: local Ghana gateway, cheapest local rates (recommended for GHS apps).
 *  - twilio: global, well-documented, pricier for Ghana.
 */
export async function sendSms(to: string, text: string): Promise<void> {
  try {
    if (env.SMS_PROVIDER === 'hubtel') return await sendViaHubtel(to, text);
    if (env.SMS_PROVIDER === 'twilio') return await sendViaTwilio(to, text);
    // 'none' (default) or misconfigured: silently no-op.
  } catch (err) {
    console.error('[sms] send failed:', err instanceof Error ? err.message : err);
  }
}

async function sendViaHubtel(to: string, text: string): Promise<void> {
  if (!env.HUBTEL_CLIENT_ID || !env.HUBTEL_CLIENT_SECRET || !env.HUBTEL_SENDER_ID) return;

  await axios.post(
    'https://sms.hubtel.com/v1/messages/send',
    { From: env.HUBTEL_SENDER_ID, To: to, Content: text },
    {
      auth: { username: env.HUBTEL_CLIENT_ID, password: env.HUBTEL_CLIENT_SECRET },
      headers: { 'Content-Type': 'application/json' },
      timeout: 10_000,
    }
  );
}

async function sendViaTwilio(to: string, text: string): Promise<void> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_SMS_FROM) return;

  // Twilio's Messages endpoint takes URL-encoded form data, not JSON.
  const form = new URLSearchParams({ To: to, From: env.TWILIO_SMS_FROM, Body: text });

  await axios.post(
    `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
    form.toString(),
    {
      auth: { username: env.TWILIO_ACCOUNT_SID, password: env.TWILIO_AUTH_TOKEN },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10_000,
    }
  );
}
