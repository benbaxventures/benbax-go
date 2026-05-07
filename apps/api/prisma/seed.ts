import bcrypt from 'bcryptjs';
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('BenbaxDemo123!', 12);

  await prisma.user.upsert({
    where: { phone: '+233200000001' },
    update: {},
    create: {
      name: 'Benbax Admin',
      phone: '+233200000001',
      email: 'admin@benbax.com',
      role: UserRole.ADMIN,
      passwordHash,
      wallet: { create: {} }
    }
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
      serviceFee: 2.5
    }
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
