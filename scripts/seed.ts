import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Seed default admin user (for automated tests only)
  let bcryptLib: any;
  try { bcryptLib = require('bcryptjs'); } catch { bcryptLib = bcrypt; }
  const hashedPw = await bcryptLib.hash('johndoe123', 10);
  await prisma.user.upsert({
    where: { email: 'john@doe.com' },
    update: {},
    create: { email: 'john@doe.com', password: hashedPw, name: 'Admin', role: 'admin' },
  });
  console.log('✅ Admin user seeded');

  // Seed default settings
  const defaultSettings = [
    { key: 'email_notifications', value: 'true' },
    { key: 'notification_frequency', value: 'instant' },
    { key: 'min_score_alert', value: '60' },
    { key: 'keywords', value: 'dron,UAS,RPAS,UAV,DJI,drone,aeronave no tripulada' },
  ];
  for (const s of defaultSettings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }
  console.log('✅ Default settings seeded');

  // NOTE: Real tender data is imported from PLACSP via /api/refresh or the scheduled daemon.
  // No fake/seed tenders, buyers or news are created by this script.
  console.log('ℹ️  No fake tenders seeded — use "Actualizar datos" or the scheduled task to import real data from PLACSP.');
}

main()
  .catch((e: any) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
