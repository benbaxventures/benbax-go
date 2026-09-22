/**
 * Grant or revoke dashboard access for one account, without touching anything else.
 *
 *   npm run staff:grant --workspace apps/api -- <identifier> [flags]
 *
 * `identifier` is a phone in any spelling or an email address.
 *
 * This is the surgical counterpart to set-admin.ts / set-staff.ts, which also
 * reset the password. Granting someone the dashboard is not a reason to change
 * their credentials — and for an account whose owner already has a working
 * password, resetting it is pure disruption. So this writes `staffRole` and
 * nothing else: `role`, password, phone, email and profile are all left alone.
 *
 * Flags:
 *   --role <ADMIN|SUPPORT|OPERATIONS>  access level to grant (default ADMIN)
 *   --revoke                           remove dashboard access instead
 *   --dry-run                          report what would change, write nothing
 *   --yes                              skip the confirmation prompt
 *
 * Uses DATABASE_URL from the environment / apps/api/.env.
 */
import { PrismaClient, StaffRole } from '@prisma/client';
import 'dotenv/config';
import readline from 'node:readline';
import { phoneLookupVariants } from '../src/utils/phone';

const STAFF_ROLES: StaffRole[] = [StaffRole.ADMIN, StaffRole.OPERATIONS, StaffRole.SUPPORT];

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question}: `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function describeDatabase(url: string | undefined) {
  if (!url) return '(DATABASE_URL is not set)';
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

/** Pulls `--flag value` out of argv, returning the value. */
function optionValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

async function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((arg) => arg.startsWith('--')));
  const revoke = flags.has('--revoke');
  const dryRun = flags.has('--dry-run');

  const roleInput = (optionValue(argv, '--role') ?? 'ADMIN').toUpperCase();
  if (!STAFF_ROLES.includes(roleInput as StaffRole)) {
    throw new Error(`--role must be one of ${STAFF_ROLES.join(', ')}`);
  }
  const staffRole = roleInput as StaffRole;

  // The first bare argument is the account; skip flags and their values.
  const roleValue = optionValue(argv, '--role');
  const identifier = argv.find(
    (arg, i) => !arg.startsWith('--') && !(roleValue && argv[i - 1] === '--role')
  );
  if (!identifier) {
    throw new Error(
      'Pass the account to change, e.g.\n' +
        '  npm run staff:grant --workspace apps/api -- someone@example.com'
    );
  }

  const prisma = new PrismaClient();
  try {
    const phones = phoneLookupVariants(identifier);
    const matches = await prisma.user.findMany({
      where: {
        OR: [
          ...phones.map((phone) => ({ phone })),
          { email: { equals: identifier.trim(), mode: 'insensitive' as const } },
        ],
      },
      take: 5,
    });

    if (!matches.length) throw new Error(`No account found for ${identifier}`);
    // Privilege must never land on a guessed row.
    if (matches.length > 1) {
      const rows = matches.map(
        (m) => `${m.phone} / ${m.email ?? '—'} (${m.role}, ${m.name.trim()})`
      );
      throw new Error(
        `${identifier} matches ${matches.length} accounts:\n    ${rows.join('\n    ')}\n` +
          '  Use an identifier that picks out exactly one.'
      );
    }

    const user = matches[0]!;
    const next = revoke ? null : staffRole;

    console.log('');
    console.log(`Database : ${describeDatabase(process.env.DATABASE_URL)}`);
    console.log(`Account  : ${user.name.trim()} <${user.email ?? '—'}> ${user.phone}`);
    console.log(`Role     : ${user.role} (unchanged — this only sets staff access)`);
    console.log(`Access   : ${user.staffRole ?? 'none'} → ${next ?? 'none'}`);
    console.log('');

    if (user.staffRole === next) {
      console.log('Already in that state — nothing to do.');
      return;
    }
    if (dryRun) {
      console.log('--dry-run: nothing was written.');
      return;
    }

    if (!flags.has('--yes')) {
      const answer = await ask('Type "yes" to apply');
      if (answer.toLowerCase() !== 'yes') {
        console.log('Aborted — nothing was changed.');
        return;
      }
    }

    await prisma.user.update({ where: { id: user.id }, data: { staffRole: next } });

    if (revoke) {
      // Access tokens live ~15 minutes and a refresh re-reads the account, so a
      // removal would otherwise linger. End the sessions now.
      const { count } = await prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      console.log(`✔ Dashboard access removed. ${count} session(s) signed out.`);
    } else {
      // No sign-out needed: a token refresh re-reads the account and picks the
      // new claim up on its own, usually within 15 minutes. Signing in again
      // makes it immediate.
      console.log(`✔ ${user.name.trim()} now has ${next} access to the dashboard.`);
      console.log('  Their password and role are unchanged, so the customer and partner');
      console.log('  apps keep working exactly as before. Sign in again to pick it up now.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
