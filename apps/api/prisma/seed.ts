import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Admin seed password is sourced from the environment so no real credential
  // is ever committed. Set SEED_ADMIN_PASSWORD in the API env before seeding;
  // the fallback is a throwaway value for fresh local databases only.
  const passwordHash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!', 12);

  await prisma.user.upsert({
    where: { phone: '+2330594172522' },
    update: {},
    create: {
      name: 'Benbax Admin',
      phone: '+2330594172522',
      email: 'admin@benbax.com',
      role: UserRole.ADMIN,
      passwordHash,
      wallet: { create: {} },
    },
  });

  await prisma.user.upsert({
    where: { phone: '+233200000002' },
    update: {
      name: 'Benbax Rider',
      role: UserRole.RIDER,
      passwordHash,
      riderProfile: {
        upsert: {
          update: {},
          create: {},
        },
      },
    },
    create: {
      name: 'Benbax Rider',
      phone: '+233200000002',
      email: 'rider@benbax.com',
      role: UserRole.RIDER,
      passwordHash,
      wallet: { create: {} },
      riderProfile: { create: {} },
    },
  });

  await prisma.pricingRule.upsert({
    where: { id: 'default-parcel-pricing' },
    update: {},
    create: {
      id: 'default-parcel-pricing',
      name: 'Default Accra Parcel',
      category: 'PARCEL',
      baseFare: 18,
      perKm: 3.5,
      perMinute: 0.35,
      serviceFee: 2.5,
    },
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
