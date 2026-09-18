/**
 * Create an admin account, or reset an existing admin's password.
 *
 *   npm run admin:set --workspace apps/api
 *
 * Uses DATABASE_URL from the environment / apps/api/.env — i.e. whatever
 * database the API itself points at. Prompts for everything it needs (the
 * password is not echoed) and asks for confirmation before writing.
 *
 * Optional environment overrides for non-interactive use:
 *   ADMIN_EMAIL, ADMIN_PHONE, ADMIN_NAME, ADMIN_PASSWORD, ADMIN_ROLE
 * Flags:
 *   --yes      skip the confirmation prompt
 *   --promote  allow turning an existing non-staff account into an admin
 */
import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import readline from 'node:readline';

const MIN_PASSWORD_LENGTH = 12;
const STAFF_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.OPERATIONS, UserRole.SUPPORT];

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

async function main() {
  const args = new Set(process.argv.slice(2));
  const interactive = process.stdin.isTTY;

  const email = (process.env.ADMIN_EMAIL ?? (await ask('Admin email', 'admin@benbax.com')))
    .trim()
    .toLowerCase();
  const name =
    process.env.ADMIN_NAME ??
    (interactive ? await ask('Display name', 'Benbax Admin') : 'Benbax Admin');
  const roleInput = (process.env.ADMIN_ROLE ?? 'ADMIN').toUpperCase();
  if (!STAFF_ROLES.includes(roleInput as UserRole)) {
    throw new Error(`ADMIN_ROLE must be one of ${STAFF_ROLES.join(', ')}`);
  }
  const role = roleInput as UserRole;

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email } });

    let phone = process.env.ADMIN_PHONE?.trim();
    if (!existing && !phone) {
      phone = await ask('Phone number for the new admin (E.164, e.g. +233241234567)');
    }
    if (!existing && !phone) throw new Error('A phone number is required to create an account');

    if (existing && !STAFF_ROLES.includes(existing.role) && !args.has('--promote')) {
      throw new Error(
        `${email} belongs to a ${existing.role} account. Re-run with --promote to make it an admin.`
      );
    }

    let password = process.env.ADMIN_PASSWORD ?? '';
    if (!password) {
      password = await askHidden(`New password (min ${MIN_PASSWORD_LENGTH} characters)`);
      const confirm = await askHidden('Repeat password');
      if (password !== confirm) throw new Error('Passwords do not match');
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }

    console.log('');
    console.log(`Database : ${describeDatabase(process.env.DATABASE_URL)}`);
    console.log(
      existing
        ? `Action   : reset password for ${existing.name} <${email}> (${existing.role} → ${STAFF_ROLES.includes(existing.role) ? existing.role : role})`
        : `Action   : create ${role} account ${name} <${email}> ${phone}`
    );
    if (!args.has('--yes')) {
      const answer = await ask('Type "yes" to continue');
      if (answer.toLowerCase() !== 'yes') {
        console.log('Aborted — nothing was changed.');
        return;
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);

    if (existing) {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: existing.id },
          data: {
            passwordHash,
            status: UserStatus.ACTIVE,
            ...(STAFF_ROLES.includes(existing.role) ? {} : { role }),
          },
        }),
        // Sign out every existing session for this account.
        prisma.refreshToken.updateMany({
          where: { userId: existing.id, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
      console.log(`✔ Password updated for ${email}. Existing sessions were signed out.`);
    } else {
      await prisma.user.create({
        data: {
          name,
          email,
          phone: phone!,
          role,
          status: UserStatus.ACTIVE,
          passwordHash,
          wallet: { create: {} },
        },
      });
      console.log(`✔ Created ${role} account ${email}.`);
    }
    console.log('Sign in to the admin dashboard with that email (or phone) and password.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
