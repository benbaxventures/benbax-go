import axios from 'axios';
import { env } from '../../../config/env';

const GRAPH_API_VERSION = 'v21.0';

/**
 * Sends a WhatsApp message via the Meta WhatsApp Cloud API (free tier: 1k
 * service conversations/month). Best-effort and no-op when unconfigured.
 *
 * Note: Meta only permits free-form text within the 24h customer service
 * window. Outside it, an approved message template is required — see
 * https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates
 * Configure WHATSAPP_CLOUD_TOKEN + WHATSAPP_PHONE_NUMBER_ID to enable.
 */
export async function sendWhatsApp(to: string, text: string): Promise<void> {
  if (!env.WHATSAPP_CLOUD_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return;

  // The Cloud API expects a bare E.164 number (country code + number, digits only).
  const recipient = to.replace(/\D/g, '');
  if (!recipient) return;

  try {
    await axios.post(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'text',
        text: { preview_url: false, body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_CLOUD_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      }
    );
  } catch (err) {
    console.error('[whatsapp] Cloud API send failed:', err instanceof Error ? err.message : err);
  }
}
