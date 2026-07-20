import axios from 'axios';
import { env } from '../../../config/env';

const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Sends a transactional email through Resend (free tier: 3k/month, 100/day).
 * Best-effort and no-op when unconfigured, so a missing key can never break a
 * ride/delivery flow. Configure RESEND_API_KEY + EMAIL_FROM to enable.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return;

  try {
    await axios.post(
      RESEND_API_URL,
      { from: env.EMAIL_FROM, to, subject, html },
      {
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      }
    );
  } catch (err) {
    console.error('[email] Resend send failed:', err instanceof Error ? err.message : err);
  }
}
