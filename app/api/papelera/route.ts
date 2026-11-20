export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

/**
 * GET /api/papelera
 * Returns ALL tenders that have been dismissed (moved to the trash).
 * This endpoint is intentionally isolated: it ONLY lists what has been
 * deleted so nothing can escape by accident. Dismissed tenders are never
 * counted in the dashboard, shown on the map, or used for indexing.
 * Optional query param: search (filters by title / contracting body).
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { searchParams } = new URL(request?.url ?? '');
    const search = (searchParams.get('search') ?? '').trim();

    const where: any = { dismissed: true };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { contractingBody: { contains: search, mode: 'insensitive' } },
      ];
    }

    const tenders = await prisma.tender.findMany({
      where,
      orderBy: [{ dismissedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        contractingBody: true,
        regionCcaa: true,
        budgetAmount: true,
        score: true,
        deadline: true,
        publicationDate: true,
        dismissedAt: true,
        classification: true,
        sourceUrl: true,
      },
      take: 1000,
    });

    return NextResponse.json({ tenders: tenders ?? [], total: (tenders ?? []).length });
  } catch (error: any) {
    console.error('Papelera API error:', error);
    return NextResponse.json({ tenders: [], total: 0, error: 'Error al cargar la papelera' }, { status: 500 });
  }
}
