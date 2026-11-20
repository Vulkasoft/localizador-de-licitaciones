export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/api-auth';
import { getTenderObjectType } from '@/lib/scoring';

// ---------------------------------------------------------------------------
// Shared filter fragments — these MUST stay identical to /api/tenders so that
// the KPI counts on the dashboard match EXACTLY what the user sees inside the
// tenders listing when they click each card. ("Esto tiene que ser fino").
// ---------------------------------------------------------------------------
const officialSourceOR = [
  { sourceUrl: { contains: 'contrataciondelestado.es' } },
  { sourceUrl: { contains: 'boe.es' } },
  { sourceUrl: { contains: 'gobierto.es' } },
  { sourceUrl: { contains: 'concursospublicos.com' } },
  { sourceUrl: { contains: 'infoconcurso.com' } },
  { sourceUrl: { contains: 'planderecuperacion.gob.es' } },
  { sourceUrl: { contains: 'ted.europa.eu' } },
  { sourceUrl: { contains: '.gob.es' } },
  { sourceUrl: { contains: '.jcyl.es' } },
  { sourceUrl: { contains: 'juntadeandalucia.es' } },
  { sourceUrl: { contains: 'comunidad.madrid' } },
  { sourceUrl: { contains: 'zaragoza.es' } },
];

const closedKeywords = ['adjudicaci', 'adjudicada', 'adjudicado', 'formaliza', 'formalizado'];

const phaseActiveAnd: any[] = [
  { tenderPhase: { in: ['licitacion', 'pre_licitacion'] } },
  { NOT: closedKeywords.map((kw) => ({ title: { contains: kw, mode: 'insensitive' as any } })) },
];

const pliegosOR = [
  { technicalDocUrl: { not: null } },
  { adminDocUrl: { not: null } },
  {
    AND: [
      { documentsJson: { not: null } },
      { NOT: [{ documentsJson: '' }, { documentsJson: '[]' }, { documentsJson: '[]_checked' }] },
    ],
  },
];

// Object-type filter (compra/formacion) — done in-memory, matches the tenders
// page default of objectFilter='relevant'.
function objectRelevant(t: { title: string; description?: string | null }) {
  const o = getTenderObjectType(t.title, t.description);
  return o === 'compra' || o === 'formacion';
}

export async function GET() {
  const auth = await requireSession();
  if (auth.response) return auth.response;

  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const in14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    // Auto-close ONLY adjudicated/formalized tenders (fire-and-forget) — same as /api/tenders.
    // Expired-by-deadline tenders are intentionally NOT closed/removed automatically.
    prisma.tender
      .updateMany({
        where: {
          status: 'active',
          OR: [
            { tenderPhase: { in: ['adjudicada', 'formalizada'] } },
            { title: { contains: 'formalización contrato', mode: 'insensitive' } },
          ],
        },
        data: { status: 'closed' },
      })
      .catch(() => {});

    // "Con Pliegos" → /tenders (default view): open + official + active phase + pliegos
    const pliegosWhere: any = {
      dismissed: false,
      AND: [
        { classification: { not: 'espectaculo_ocio' } },
        { OR: officialSourceOR },
        ...phaseActiveAnd,
        { OR: pliegosOR },
      ],
    };

    // "Vencen Pronto" → /tenders?expiring=true
    const expiringWhere: any = {
      dismissed: false,
      status: 'active',
      deadline: { gte: now, lte: in14 },
      AND: [{ OR: officialSourceOR }, ...phaseActiveAnd, { OR: pliegosOR }],
    };

    // "Nuevas Esta Semana" → /tenders?new=true
    const newWhere: any = {
      dismissed: false,
      publicationDate: { gte: weekAgo },
      AND: [
        { classification: { not: 'espectaculo_ocio' } },
        { OR: officialSourceOR },
        ...phaseActiveAnd,
        { OR: pliegosOR },
      ],
    };

    // Doc coverage operates on the open+official+active set (whether or not it
    // already has pliegos) so the "Indexar" progress reflects work remaining.
    const openOfficialWhere: any = {
      dismissed: false,
      AND: [
        { classification: { not: 'espectaculo_ocio' } },
        { OR: officialSourceOR },
        ...phaseActiveAnd,
      ],
    };

    const [pliegosRows, expiringRows, newRows, expiringListRaw, lastRefreshSetting, docTotal, docIndexed] =
      await Promise.all([
        prisma.tender.findMany({ where: pliegosWhere, select: { regionCcaa: true, title: true, description: true } }),
        prisma.tender.findMany({ where: expiringWhere, select: { title: true, description: true } }),
        prisma.tender.findMany({ where: newWhere, select: { title: true, description: true } }),
        prisma.tender.findMany({ where: expiringWhere, orderBy: { deadline: 'asc' }, take: 60 }),
        prisma.setting.findUnique({ where: { key: 'last_refresh' } }),
        prisma.tender.count({ where: openOfficialWhere }),
        prisma.tender.count({
          where: {
            ...openOfficialWhere,
            documentsJson: { not: null },
            NOT: [{ documentsJson: '' }, { documentsJson: '[]' }, { documentsJson: '[]_checked' }],
          },
        }),
      ]);

    // Apply the in-memory object-type filter to match the tenders listing exactly
    const pliegosRelevant = (pliegosRows ?? []).filter(objectRelevant);
    const withPliegos = pliegosRelevant.length;
    const expiringSoon = (expiringRows ?? []).filter(objectRelevant).length;
    const newThisWeek = (newRows ?? []).filter(objectRelevant).length;

    // byCcaa derived from the SAME relevant set so the CCAA filter counts add up
    const ccaaMap = new Map<string, number>();
    for (const t of pliegosRelevant) {
      const k = t.regionCcaa ?? 'Desconocida';
      ccaaMap.set(k, (ccaaMap.get(k) ?? 0) + 1);
    }
    const byCcaa = Array.from(ccaaMap.entries()).map(([ccaa, count]) => ({ ccaa, count, budget: 0 }));

    // Expiring list for the "Próximos Vencimientos" widget — object-filtered too
    const expiringTenders = (expiringListRaw ?? []).filter(objectRelevant).slice(0, 12);

    return NextResponse.json({
      kpis: {
        totalActive: withPliegos,
        expiringSoon,
        newThisWeek,
      },
      byCcaa,
      withPliegos,
      expiringTenders,
      lastRefresh: lastRefreshSetting?.value ?? null,
      docCoverage: { total: docTotal ?? 0, indexed: docIndexed ?? 0, withPliegos },
    });
  } catch (error: any) {
    console.error('Dashboard API error:', error);
    return NextResponse.json({ error: 'Error al cargar dashboard' }, { status: 500 });
  }
}
