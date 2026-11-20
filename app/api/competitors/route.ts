export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/api-auth';

export async function GET(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  try {
    const { searchParams } = new URL(req.url);
    const ccaa = searchParams.get('ccaa');
    const category = searchParams.get('category');

    const where: any = {
      awardedTo: { not: null },
      classification: { not: 'espectaculo_ocio' },
    };
    if (ccaa) where.regionCcaa = ccaa;
    if (category) where.classification = category;

    // Group adjudications by awardee
    const grouped = await prisma.tender.groupBy({
      by: ['awardedTo'],
      where,
      _count: { _all: true },
      _sum: { awardedAmount: true },
      _avg: { awardedAmount: true },
      orderBy: { _count: { awardedTo: 'desc' } },
      take: 50,
    });

    // Pull recent awards for each top 20 competitor for table preview
    const top20 = grouped.slice(0, 20).map(g => g.awardedTo).filter(Boolean) as string[];
    const recentAwards = top20.length > 0
      ? await prisma.tender.findMany({
          where: { ...where, awardedTo: { in: top20 } },
          orderBy: { awardedDate: 'desc' },
          take: 200,
          select: {
            id: true, title: true, awardedTo: true, awardedAmount: true, awardedDate: true,
            regionCcaa: true, classification: true, score: true,
          },
        })
      : [];

    // Per-CCAA leaderboard
    const byRegion = await prisma.tender.groupBy({
      by: ['regionCcaa', 'awardedTo'],
      where,
      _count: { _all: true },
      _sum: { awardedAmount: true },
      orderBy: { _count: { awardedTo: 'desc' } },
      take: 100,
    });

    return NextResponse.json({
      total: grouped.length,
      competitors: grouped.map(g => ({
        name: g.awardedTo,
        awards: g._count?._all || 0,
        totalAmount: g._sum?.awardedAmount || 0,
        avgAmount: g._avg?.awardedAmount || 0,
      })),
      recentAwards,
      byRegion: byRegion.map(g => ({
        ccaa: g.regionCcaa || 'Sin definir',
        name: g.awardedTo,
        awards: g._count?._all || 0,
        totalAmount: g._sum?.awardedAmount || 0,
      })),
    });
  } catch (e: any) {
    console.error('competitors error', e);
    return NextResponse.json({ error: 'Error al cargar competidores' }, { status: 500 });
  }
}
