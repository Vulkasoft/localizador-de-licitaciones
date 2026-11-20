import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const total = await prisma.tender.count();
  const phases = await prisma.tender.groupBy({ by: ['tenderPhase'], _count: true });
  const awarded = await prisma.tender.count({ where: { awardedTo: { not: null } } });
  console.log('total', total);
  console.log('phases', phases);
  console.log('awarded', awarded);
}
main().finally(() => prisma.$disconnect());
