export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/api-auth';
import { CCAA_DATA } from '@/lib/spain-geo';
import { getTenderObjectType } from '@/lib/scoring';
import { detectRegionFromText } from '@/lib/placsp';

// Normalize CCAA aliases that may appear in feeds
const CCAA_ALIASES: Record<string, string> = {
  'Illes Balears': 'Islas Baleares',
  'Illes Baleares': 'Islas Baleares',
  'Comunitat Valenciana': 'Comunidad Valenciana',
  'Comunidad Valenciana': 'Comunidad Valenciana',
  'Comunidad Foral de Navarra': 'Navarra',
  'Principado de Asturias': 'Asturias',
  'Madrid': 'Comunidad de Madrid',
  'Murcia': 'Región de Murcia',
  // National / state-wide buckets → single national centroid
  'Nacional': 'Ámbito Nacional',
  'España': 'Ámbito Nacional',
  'Estatal': 'Ámbito Nacional',
  'Ámbito Nacional': 'Ámbito Nacional',
};

function normalizeCcaa(c: string | null): string | null {
  if (!c) return null;
  const trimmed = c.trim();
  if (CCAA_ALIASES[trimmed]) return CCAA_ALIASES[trimmed];
  return trimmed;
}

// Adjective / colloquial region forms that detectRegionFromText misses
// (e.g. "Agencia Canaria", "Universitat de València").
const EXTRA_REGION_KW: [string, string][] = [
  ['canaria', 'Canarias'],
  ['valència', 'Comunidad Valenciana'],
  ['valencia', 'Comunidad Valenciana'],
  ['valenciana', 'Comunidad Valenciana'],
  ['valenciano', 'Comunidad Valenciana'],
  ['catalana', 'Cataluña'],
  ['català', 'Cataluña'],
  ['gallega', 'Galicia'],
  ['galega', 'Galicia'],
  ['andaluza', 'Andalucía'],
  ['andaluz', 'Andalucía'],
  ['vasca', 'País Vasco'],
  ['vasco', 'País Vasco'],
  ['balear', 'Islas Baleares'],
  ['mallorca', 'Islas Baleares'],
  ['menorca', 'Islas Baleares'],
  ['ibiza', 'Islas Baleares'],
  ['madrileñ', 'Comunidad de Madrid'],
  ['murciana', 'Región de Murcia'],
  ['murciano', 'Región de Murcia'],
  ['riojana', 'La Rioja'],
  ['aragonesa', 'Aragón'],
  ['aragonés', 'Aragón'],
  ['asturiana', 'Asturias'],
  ['cántabra', 'Cantabria'],
  ['extremeña', 'Extremadura'],
  ['manchega', 'Castilla-La Mancha'],
  ['leonesa', 'Castilla y León'],
];

// Resolve the best CCAA for a tender, guaranteeing a mappable location so no
// pending tender is ever silently dropped from the map.
function resolveCcaa(t: any): string {
  // 1. Stored region, if it maps to a known centroid
  const norm = normalizeCcaa(t?.regionCcaa ?? null);
  if (norm && CCAA_DATA[norm]) return norm;

  const text = `${t?.contractingBody ?? ''} ${t?.title ?? ''} ${t?.description ?? ''}`;

  // 2. City / official keyword detection
  const detected = detectRegionFromText(text);
  if (detected && CCAA_DATA[detected]) return detected;

  // 3. Adjective / colloquial forms
  const lower = text.toLowerCase();
  for (const [kw, region] of EXTRA_REGION_KW) {
    if (lower.includes(kw)) return region;
  }

  // 4. Fallback: national bodies (Ministerio, Guardia Civil, Defensa, etc.)
  //    and anything still unresolved are placed at the national centroid.
  return 'Ámbito Nacional';
}

// Slight jitter so multiple markers in same CCAA don't fully overlap
function jitter(seed: string, range = 0.6): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return ((Math.sin(h) + 1) / 2 - 0.5) * range;
}

// ---------------------------------------------------------------------------
// The map MUST show exactly the same "pending" tenders as the dashboard and the
// /tenders listing: open + official source + active phase + with pliegos + a
// relevant object type (compra/formacion). Every one of those tenders is then
// guaranteed a location so the map is a faithful, functional view.
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

export async function GET() {
  const auth = await requireSession();
  if (auth.response) return auth.response;

  try {
    // Pending tenders — matches /api/tenders. Expired tenders are kept (not auto-removed);
    // only genuinely adjudicated/formalized ones (status closed) are excluded.
    const pendingWhere: any = {
      dismissed: false,
      status: 'active',
      AND: [
        { classification: { not: 'espectaculo_ocio' } },
        { OR: officialSourceOR },
        ...phaseActiveAnd,
        { OR: pliegosOR },
      ],
    };

    const rows = await prisma.tender.findMany({
      where: pendingWhere,
      select: {
        id: true,
        title: true,
        description: true,
        contractingBody: true,
        score: true,
        regionCcaa: true,
        province: true,
        latitude: true,
        longitude: true,
        budgetAmount: true,
        classification: true,
        deadline: true,
      },
    });

    // Keep only relevant object types (compra/formacion), matching the listing
    const tenders = (rows ?? []).filter((t: any) => {
      const o = getTenderObjectType(t.title, t.description);
      return o === 'compra' || o === 'formacion';
    });

    // Build markers: EVERY pending tender is placed. Use real coordinates when
    // available, otherwise synthesize from the resolved CCAA centroid + jitter.
    const markers = tenders
      .map((t: any) => {
        const ccaa = resolveCcaa(t);
        let lat = t?.latitude as number | null;
        let lng = t?.longitude as number | null;
        if ((!lat || !lng) && CCAA_DATA[ccaa]) {
          lat = CCAA_DATA[ccaa].lat + jitter(t?.id ?? '', 0.7);
          lng = CCAA_DATA[ccaa].lng + jitter((t?.id ?? '') + 'x', 0.9);
        }
        return { ...t, regionCcaa: ccaa, latitude: lat, longitude: lng };
      })
      .filter((t: any) => t?.latitude && t?.longitude);

    // Aggregate regions from the SAME resolved set so counts match the markers
    const regionMap = new Map<string, { count: number; budget: number; avgScoreSum: number; n: number }>();
    for (const t of tenders) {
      const ccaa = resolveCcaa(t);
      const cur = regionMap.get(ccaa) ?? { count: 0, budget: 0, avgScoreSum: 0, n: 0 };
      cur.count += 1;
      cur.budget += t?.budgetAmount ?? 0;
      cur.avgScoreSum += t?.score ?? 0;
      cur.n += 1;
      regionMap.set(ccaa, cur);
    }

    const regions = Array.from(regionMap.entries()).map(([ccaa, v]) => ({
      ccaa,
      count: v.count,
      budget: v.budget,
      avgScore: v.n > 0 ? Math.round(v.avgScoreSum / v.n) : 0,
    }));

    return NextResponse.json({ markers, regions });
  } catch (error: any) {
    console.error('Map API error:', error);
    return NextResponse.json({ markers: [], regions: [] }, { status: 500 });
  }
}
