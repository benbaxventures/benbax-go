import type { Prisma } from '@prisma/client';
import { UserStatus, type UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { sendEmail } from './channels/email';
import { sendSms } from './channels/sms';
import { sendWhatsApp } from './channels/whatsapp';
import { sendExpoPushToUserIds } from './push';

export type NotifyChannel = 'inapp' | 'push' | 'whatsapp' | 'sms' | 'email';

/** Zero-cost channels — safe to fan out to a whole role/fleet. */
export const FREE_CHANNELS: readonly NotifyChannel[] = ['inapp', 'push'];
/** Everything, including the paid/rate-limited gateways. Use for 1:1 alerts. */
export const ALL_CHANNELS: readonly NotifyChannel[] = ['inapp', 'push', 'whatsapp', 'sms', 'email'];

export interface NotifyMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Optional richer HTML for the email channel; falls back to the plain body. */
  emailHtml?: string;
}

export interface NotifyTarget {
  /** Explicit recipients by user id. */
  userIds?: string[];
  /** Broadcast to every active user holding any of these roles. */
  roles?: UserRole[];
  /** Channels to use. Defaults to the free channels. */
  channels?: readonly NotifyChannel[];
  /** Never notify this user (e.g. the actor who triggered the event). */
  excludeUserId?: string;
}

type Recipient = { id: string; name: string; phone: string | null; email: string | null };

/**
 * Central multi-channel notification dispatcher. Resolves the recipient set
 * once, then fans a single message out across the requested channels:
 * in-app (persisted feed), Expo push, WhatsApp, SMS, and email.
 *
 * Fully best-effort: a failure in any one channel never rejects the others and
 * never throws, so notifications can never break the order/ride flow. Callers
 * fire-and-forget with `void notify(...)`.
 */
export async function notify(target: NotifyTarget, message: NotifyMessage): Promise<void> {
  try {
    const channels = target.channels ?? FREE_CHANNELS;
    const recipients = await resolveRecipients(target);
    if (recipients.length === 0) return;

    const userIds = recipients.map((r) => r.id);
    const smsBody = `${message.title}\n${message.body}`;
    const whatsAppBody = `*${message.title}*\n${message.body}`;
    const emailHtml = message.emailHtml ?? defaultEmailHtml(message);

    await Promise.allSettled([
      channels.includes('inapp') ? persistInApp(recipients, message) : undefined,
      channels.includes('push') ? sendExpoPushToUserIds(userIds, message) : undefined,
      channels.includes('sms')
        ? fanOut(
            recipients,
            (r) => r.phone,
            (to) => sendSms(to, smsBody)
          )
        : undefined,
      channels.includes('whatsapp')
        ? fanOut(
            recipients,
            (r) => r.phone,
            (to) => sendWhatsApp(to, whatsAppBody)
          )
        : undefined,
      channels.includes('email')
        ? fanOut(
            recipients,
            (r) => r.email,
            (to) => sendEmail(to, message.title, emailHtml)
          )
        : undefined,
    ]);
  } catch (err) {
    console.error('[notify] dispatch failed:', err instanceof Error ? err.message : err);
  }
}

async function resolveRecipients(target: NotifyTarget): Promise<Recipient[]> {
  const or: Prisma.UserWhereInput[] = [];
  if (target.userIds?.length) or.push({ id: { in: target.userIds } });
  if (target.roles?.length) or.push({ role: { in: target.roles } });
  if (or.length === 0) return [];

  const users = await prisma.user.findMany({
    where: {
      status: UserStatus.ACTIVE,
      OR: or,
      ...(target.excludeUserId ? { id: { not: target.excludeUserId } } : {}),
    },
    select: { id: true, name: true, phone: true, email: true },
  });
  return users;
}

async function persistInApp(recipients: Recipient[], message: NotifyMessage): Promise<void> {
  await prisma.notification.createMany({
    data: recipients.map((r) => ({
      userId: r.id,
      title: message.title,
      body: message.body,
      data: (message.data ?? {}) as Prisma.InputJsonValue,
    })),
  });
}

async function fanOut(
  recipients: Recipient[],
  pick: (r: Recipient) => string | null,
  send: (to: string) => Promise<void>
): Promise<void> {
  const targets = recipients.map(pick).filter((v): v is string => Boolean(v));
  await Promise.allSettled(targets.map(send));
}

function defaultEmailHtml(message: NotifyMessage): string {
  const escape = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 12px;color:#111">${escape(message.title)}</h2>
  <p style="margin:0;color:#444;line-height:1.5;white-space:pre-line">${escape(message.body)}</p>
  <hr style="margin:24px 0;border:none;border-top:1px solid #eee" />
  <p style="margin:0;color:#999;font-size:12px">Benbax Go</p>
</div>`;
}
