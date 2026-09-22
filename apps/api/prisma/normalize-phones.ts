/**
 * Rewrite stored phone numbers to E.164.
 *
 *   npm run phones:check     --workspace apps/api    # report only
 *   npm run phones:normalize --workspace apps/api    # apply
 *
 * Numbers reached the database in several shapes over time: `0594172522` from
 * hand-entered rows, and `+2330594172522` — country code glued onto the trunk
 * zero — from an older seed. Sign-in tolerates all of them (see
 * phoneLookupVariants), but everything that dials a number expects E.164, so
 * the stored values should converge on it.
 *
 * Reports first and writes nothing without --apply. Rows it cannot convert, or
 * that would collide with another account, are listed and left alone — merging
 * two accounts is a decision for a human, not a migration script.
 *
 * Uses DATABASE_URL from the environment / apps/api/.env.
 */
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';
import { normalizePhoneNumber } from '../src/utils/phone';

function describeDatabase(url: string | undefined) {
  if (!url) return '(DATABASE_URL is not set)';
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

async function main() {
  const apply = process.argv.slice(2).includes('--apply');
  const prisma = new PrismaClient();

  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, phone: true, role: true },
      orderBy: { createdAt: 'asc' },
    });

    const taken = new Set(users.map((user) => user.phone));
    const changes: { id: string; name: string; from: string; to: string }[] = [];
    const unconvertible: typeof users = [];
    const collisions: { name: string; from: string; to: string }[] = [];

    for (const user of users) {
      // Placeholder identities (google:…, deleted:…) are not phone numbers.
      if (user.phone.startsWith('google:') || user.phone.startsWith('deleted:')) continue;

      const normalized = normalizePhoneNumber(user.phone);
      if (!normalized) {
        unconvertible.push(user);
        continue;
      }
      if (normalized === user.phone) continue;

      if (taken.has(normalized)) {
        collisions.push({ name: user.name, from: user.phone, to: normalized });
        continue;
      }

      taken.delete(user.phone);
      taken.add(normalized);
      changes.push({ id: user.id, name: user.name, from: user.phone, to: normalized });
    }

    console.log('');
    console.log(`Database : ${describeDatabase(process.env.DATABASE_URL)}`);
    console.log(`Users    : ${users.length}`);
    console.log('');

    if (changes.length) {
      console.log(`${changes.length} number(s) to normalize:`);
      for (const change of changes) {
        console.log(`  ${change.from.padEnd(18)} → ${change.to.padEnd(16)} ${change.name}`);
      }
    } else {
      console.log('Every stored number is already E.164.');
    }

    if (collisions.length) {
      console.log('');
      console.log(`${collisions.length} left alone — the normalized number is already in use:`);
      for (const c of collisions) console.log(`  ${c.from} → ${c.to} (${c.name})`);
      console.log('  These are probably duplicate accounts. Merge them by hand.');
    }

    if (unconvertible.length) {
      console.log('');
      console.log(`${unconvertible.length} left alone — not a recognisable phone number:`);
      for (const u of unconvertible) console.log(`  ${u.phone} (${u.name}, ${u.role})`);
    }

    console.log('');
    if (!changes.length) return;
    if (!apply) {
      console.log('Report only. Re-run with --apply to write these changes.');
      return;
    }

    for (const change of changes) {
      await prisma.user.update({ where: { id: change.id }, data: { phone: change.to } });
    }
    console.log(`✔ Normalized ${changes.length} number(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
