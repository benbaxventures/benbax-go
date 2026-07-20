import type { UserRole } from '@prisma/client';
import axios from 'axios';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
// Expo accepts at most 100 messages per request.
const EXPO_CHUNK_SIZE = 100;

export type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type ExpoPushTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

function isExpoToken(token: string): boolean {
  return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Sends a push notification to every Expo device token registered for a user.
 * Best-effort: it never throws, so a push failure cannot break ride/delivery
 * dispatch. Tokens that Expo reports as unregistered are pruned from the DB.
 */
export async function sendExpoPushToUser(userId: string, message: PushMessage): Promise<void> {
  return sendExpoPushToTokens(
    (await prisma.deviceToken.findMany({ where: { userId } })).map((d) => d.token),
    message
  );
}

/**
 * Sends a push to every device registered to any of the given users. Used by
 * the multi-channel dispatcher, which resolves recipients once and reuses the
 * list across channels. Never throws.
 */
export async function sendExpoPushToUserIds(
  userIds: string[],
  message: PushMessage
): Promise<void> {
  if (userIds.length === 0) return;
  const devices = await prisma.deviceToken.findMany({
    where: { userId: { in: userIds } },
    select: { token: true },
  });
  return sendExpoPushToTokens(
    devices.map((d) => d.token),
    message
  );
}

/**
 * Sends a push to every device belonging to any user with the given role.
 * Best-effort — used for broadcast-style alerts such as notifying all drivers
 * that a new passenger just registered. Never throws.
 */
export async function sendExpoPushToRole(role: UserRole, message: PushMessage): Promise<void> {
  const devices = await prisma.deviceToken.findMany({
    where: { user: { role } },
    select: { token: true },
  });
  return sendExpoPushToTokens(
    devices.map((d) => d.token),
    message
  );
}

async function sendExpoPushToTokens(rawTokens: string[], message: PushMessage): Promise<void> {
  try {
    const tokens = rawTokens.filter(isExpoToken);
    if (tokens.length === 0) return;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    // An Expo access token is optional but recommended for production security.
    if (env.EXPO_ACCESS_TOKEN) {
      headers.Authorization = `Bearer ${env.EXPO_ACCESS_TOKEN}`;
    }

    const staleTokens: string[] = [];

    for (const tokenChunk of chunk(tokens, EXPO_CHUNK_SIZE)) {
      const payload = tokenChunk.map((to) => ({
        to,
        title: message.title,
        body: message.body,
        data: message.data ?? {},
        sound: 'default',
        priority: 'high',
        channelId: 'ride-offers',
      }));

      const response = await axios.post<{ data?: ExpoPushTicket[] }>(EXPO_PUSH_URL, payload, {
        headers,
        timeout: 10_000,
      });

      const tickets = response.data?.data ?? [];
      tickets.forEach((ticket, index) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          const staleToken = tokenChunk[index];
          if (staleToken) staleTokens.push(staleToken);
        }
      });
    }

    if (staleTokens.length > 0) {
      await prisma.deviceToken.deleteMany({ where: { token: { in: staleTokens } } });
    }
  } catch (err) {
    console.error('[push] Failed to send Expo push notification:', err);
  }
}
