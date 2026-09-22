/**
 * Provision every Benbax staff sign-in for the admin dashboard in one pass.
 *
 *   npm run staff:set --workspace apps/api
 *
 * set-admin.ts handles one account at a time, keyed on email. This one takes
 * the whole team list below, keyed on phone or email, so every staff sign-in
 * is provisioned in a single run.
 *
 * Numbers are stored normalized (E.164), and an account already sitting on a
 * differently-spelled version of the same number — `0594172522`, or the
 * malformed `+2330594172522` an old seed wrote — is found and repaired rather
 * than duplicated. An entry that matches more than one account aborts the run:
 * this script resets passwords, so it must never guess which row you meant.
 *
 * Uses DATABASE_URL from the environment / apps/api/.env, i.e. whatever
 * database the API itself points at. Prompts for the password (not echoed) and
 * asks for confirmation before writing anything.
 *
 * Environment overrides for non-interactive use:
 *   STAFF_PASSWORD   the password to set on every listed account
 *   STAFF_ROLE       ADMIN (default) | OPERATIONS | SUPPORT
 * Flags:
 *   --yes            skip the confirmation prompt
 *   --promote        allow converting an existing customer/driver account
 *   --dry-run        report what would change and write nothing
 */
import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import readline from 'node:readline';
import { normalizePhoneNumber, phoneLookupVariants } from '../src/utils/phone';

const MIN_PASSWORD_LENGTH = 12;
const STAFF_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.OPERATIONS, UserRole.SUPPORT];

/**
 * The Benbax staff sign-ins, each located by `phone`, `email`, or both.
 *
 * Verified against the live database on 2026-09-20 (`npm run phones:check` plus
 * a staff listing) — the notes below say what each entry actually resolves to,
 * because two of the three are existing accounts being converted, not new ones.
 *
 * Deliberately absent: `059 417 2522`. That number carries two accounts — the
 * owner's ADMIN on the malformed `+2330594172522` and an unrelated DRIVER on
 * `+233594172522` — and the decision was to leave both alone and sign in with
 * brightanyawe55@gmail.com instead. Adding it here would make this script pick
 * one of the two to overwrite.
 */
const TEAM: { phone?: string; email?: string; name: string }[] = [
  // Existing Google sign-in DRIVER ("BENBAX VENTURES") with no password.
  // Needs --promote; gains a password so the address can sign in normally.
  { email: 'benbaxventures@gmail.com', name: 'Benbax Ventures' },
  // No account on this number yet — created fresh.
  { phone: '059 820 4414', name: 'Benbax Operations' },
  // Existing CUSTOMER ("Ruben Agbaxode"), confirmed as a Benbax number.
  // Needs --promote; ride history is preserved.
  { phone: '054 601 3031', name: 'Benbax Support' },
];

function ask(question: string, fallback = ''): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const suffix = fallback ? ` [${fallback}]` : '';
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || fallback);
    });
  });
}

/** Reads a line without echoing it to the terminal. */
function askHidden(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  const writable = rl as unknown as { _writeToOutput: (text: string) => void };
  let muted = false;
  writable._writeToOutput = (text: string) => {
    if (!muted) process.stdout.write(text);
  };
  return new Promise((resolve) => {
    rl.question(`${question}: `, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
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

type Plan = {
  /** Normalized number to store, or null for an email-only entry. */
  phone: string | null;
  label: string;
  name: string;
  email: string | undefined;
  existingId: string | null;
  action: string;
};

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const roleInput = (process.env.STAFF_ROLE ?? 'ADMIN').toUpperCase();
  if (!STAFF_ROLES.includes(roleInput as UserRole)) {
    throw new Error(`STAFF_ROLE must be one of ${STAFF_ROLES.join(', ')}`);
  }
  const role = roleInput as UserRole;

  const prisma = new PrismaClient();
  try {
    const plans: Plan[] = [];

    for (const member of TEAM) {
      if (!member.phone && !member.email) {
        throw new Error(`TEAM entry "${member.name}" needs a phone or an email`);
      }

      const phone = member.phone ? normalizePhoneNumber(member.phone) : null;
      if (member.phone && !phone) {
        throw new Error(`${member.phone} is not a valid phone number`);
      }
      const email = member.email?.trim().toLowerCase();
      const label = member.phone ?? email ?? member.name;

      // Locate the account by every spelling the number could be stored under,
      // plus the email, so a legacy row is updated in place instead of
      // colliding on a unique key.
      const matches = await prisma.user.findMany({
        where: {
          OR: [
            ...(phone ? phoneLookupVariants(phone).map((value) => ({ phone: value })) : []),
            ...(email ? [{ email }] : []),
          ],
        },
        take: 5,
      });

      // Resetting a password on the wrong row is not recoverable, so an
      // ambiguous entry stops the run rather than picking a winner.
      if (matches.length > 1) {
        const rows = matches.map((m) => `${m.phone} / ${m.email ?? '—'} (${m.role}, ${m.name})`);
        throw new Error(
          `${label} matches ${matches.length} accounts:\n    ${rows.join('\n    ')}\n` +
            '  Resolve the duplicates, or key this TEAM entry on something unique.'
        );
      }
      const existing = matches[0] ?? null;

      if (existing && !STAFF_ROLES.includes(existing.role) && !args.has('--promote')) {
        throw new Error(
          `${label} belongs to a ${existing.role} account (${existing.name.trim()}). ` +
            'Re-run with --promote to make it a staff account.'
        );
      }

      // An email-only entry must not be created from nothing: phone is
      // required and NOT NULL, and inventing one would be a guess.
      if (!existing && !phone) {
        throw new Error(
          `No account found for ${label}, and the TEAM entry has no phone number to create one with.`
        );
      }

      const changes: string[] = [];
      if (!existing) changes.push(`create ${role}`);
      else {
        changes.push('reset password');
        if (phone && existing.phone !== phone) {
          changes.push(`repair phone ${existing.phone} → ${phone}`);
        }
        if (!STAFF_ROLES.includes(existing.role)) changes.push(`${existing.role} → ${role}`);
        if (existing.status !== UserStatus.ACTIVE) changes.push(`${existing.status} → ACTIVE`);
        if (email && existing.email !== email) changes.push(`set email ${email}`);
      }

      plans.push({
        phone,
        label,
        name: member.name,
        email,
        existingId: existing?.id ?? null,
        action: changes.join(', '),
      });
    }

    console.log('');
    console.log(`Database : ${describeDatabase(process.env.DATABASE_URL)}`);
    for (const plan of plans) {
      console.log(`  ${plan.label.padEnd(26)} — ${plan.action}`);
    }
    console.log('');

    if (dryRun) {
      console.log('--dry-run: nothing was written.');
      return;
    }

    let password = process.env.STAFF_PASSWORD ?? '';
    if (!password) {
      console.log(`This password will be set on all ${plans.length} accounts above.`);
      password = await askHidden(`Password (min ${MIN_PASSWORD_LENGTH} characters)`);
      const confirm = await askHidden('Repeat password');
      if (password !== confirm) throw new Error('Passwords do not match');
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }

    if (!args.has('--yes')) {
      const answer = await ask('Type "yes" to apply');
      if (answer.toLowerCase() !== 'yes') {
        console.log('Aborted — nothing was changed.');
        return;
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);

    for (const plan of plans) {
      if (plan.existingId) {
        await prisma.$transaction([
          prisma.user.update({
            where: { id: plan.existingId },
            data: {
              // Left untouched for an email-only entry, whose account may carry
              // a non-dialable placeholder such as `google:<sub>`.
              ...(plan.phone ? { phone: plan.phone } : {}),
              passwordHash,
              status: UserStatus.ACTIVE,
              role,
              ...(plan.email ? { email: plan.email } : {}),
            },
          }),
          // Sign out every existing session for this account.
          prisma.refreshToken.updateMany({
            where: { userId: plan.existingId, revokedAt: null },
            data: { revokedAt: new Date() },
          }),
        ]);
        console.log(`✔ Updated ${plan.label}`);
      } else {
        await prisma.user.create({
          data: {
            name: plan.name,
            // Guaranteed non-null: an entry with no phone and no existing
            // account is rejected while planning.
            phone: plan.phone!,
            email: plan.email ?? null,
            role,
            status: UserStatus.ACTIVE,
            passwordHash,
            wallet: { create: {} },
          },
        });
        console.log(`✔ Created ${plan.label}`);
      }
    }

    console.log('');
    console.log('Sign in to the admin dashboard with any of those identifiers.');
    console.log('Existing sessions on these accounts were signed out.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
