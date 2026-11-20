import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const p = new PrismaClient();
(async () => {
  const hash = await bcrypt.hash('1234', 10);
  const u = await p.user.upsert({
    where: { email: 'jose.mora@localizandotudron.com' },
    update: { password: hash, name: 'Jose Mora', role: 'admin' },
    create: { email: 'jose.mora@localizandotudron.com', password: hash, name: 'Jose Mora', role: 'admin' },
  });
  console.log('User:', u.email);
  await p.$disconnect();
})();
