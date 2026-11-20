export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getTenderObjectType } from '@/lib/scoring';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request?.url ?? '');
    const search = searchParams.get('search') ?? '';
    const ccaa = searchParams.get('ccaa') ?? '';
    const category = searchParams.get('category') ?? '';
    const status = searchParams.get('status') ?? '';
    const minScore = parseInt(searchParams.get('minScore') ?? '0');
    const maxBudget = parseFloat(searchParams.get('maxBudget') ?? '999999999');
    const minBudget = parseFloat(searchParams.get('minBudget') ?? '0');
    const sortBy = searchParams.get('sortBy') ?? 'score';
    const sortOrder = searchParams.get('sortOrder') ?? 'desc';
    const limit = parseInt(searchParams.get('limit') ?? '50');
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const expiring = searchParams.get('expiring') === 'true';
    const newOnly = searchParams.get('new') === 'true';
    // By default, only show tenders with pliegos (technical or admin docs or indexed docs)
    const hasPliegos = searchParams.get('pliegos') !== 'false';
    const showExpired = searchParams.get('showExpired') === 'true';
    const contractType = searchParams.get('contractType') ?? ''; // '', 'minor', 'regular'
    const cpv = searchParams.get('cpv') ?? '';
    const dateRange = searchParams.get('dateRange') ?? ''; // '', '7', '30', '90', '180', 'custom'
    const dateFrom = searchParams.get('dateFrom') ?? '';
    const dateTo = searchParams.get('dateTo') ?? '';
    // Source filter: 'official' (default) = PLACSP + BOE + gobierto etc, 'all' = include news
    const sourceFilter = searchParams.get('sourceFilter') ?? 'official';
    // Phase filter: 'active' (default) = licitacion + pre_licitacion, 'all' = include formalizada/adjudicada
    const phaseFilter = searchParams.get('phaseFilter') ?? 'active';

    const where: any = { dismissed: false };
    const now = new Date();
    const customerIdFilter = searchParams.get('customerId') ?? '';
    if (customerIdFilter) {
      where.customerId = customerIdFilter;
    }

    // Auto-close only ADJUDICATED/FORMALIZED tenders (fire-and-forget, non-blocking).
    // NOTE: we intentionally DO NOT close tenders just because their deadline passed —
    // expired tenders stay visible (marked "Vencida") and are never removed automatically.
    prisma.tender.updateMany({
      where: { status: 'active', OR: [
        { tenderPhase: { in: ['adjudicada', 'formalizada'] } },
        { title: { contains: 'formalización contrato', mode: 'insensitive' } },
      ] },
      data: { status: 'closed' },
    }).catch(() => {});
    if (expiring) {
      const in14 = new Date(); in14.setDate(in14.getDate() + 14);
      where.status = 'active';
      where.deadline = { gte: now, lte: in14 };
    } else if (!showExpired) {
      // Default: keep ALL tenders (incl. expired) except espectáculo/ocio.
      // Expired tenders are NOT hidden — they are shown last and badged "Vencida".
      if (!where.AND) where.AND = [];
      where.AND.push({ classification: { not: 'espectaculo_ocio' } });
    }
    if (newOnly) {
      const since = new Date(); since.setDate(since.getDate() - 7);
      where.publicationDate = { gte: since };
    }
    
    // Source filter - by default only show official sources (PLACSP, BOE, gobierto, concursospublicos, infoconcurso, planderecuperacion, zaragoza.es)
    if (sourceFilter === 'official') {
      if (!where.AND) where.AND = [];
      where.AND.push({
        OR: [
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
        ]
      });
    }
    
    // Phase filter - by default only show active phases (licitacion, pre_licitacion)
    if (phaseFilter === 'active') {
      if (!where.AND) where.AND = [];
      where.AND.push({
        tenderPhase: { in: ['licitacion', 'pre_licitacion'] }
      });
      // Safety net: also exclude tenders with closed keywords in title even if phase is wrong
      const closedKeywords = ['adjudicaci', 'adjudicada', 'adjudicado', 'formaliza', 'formalizado'];
      where.AND.push({
        NOT: closedKeywords.map(kw => ({
          title: { contains: kw, mode: 'insensitive' as any }
        }))
      });
    }
    
    // Date range filter
    if (dateRange && dateRange !== 'custom') {
      const days = parseInt(dateRange);
      const since = new Date();
      since.setDate(since.getDate() - days);
      if (!where.AND) where.AND = [];
      where.AND.push({ publicationDate: { gte: since } });
    } else if (dateRange === 'custom' && (dateFrom || dateTo)) {
      const dateFilter: any = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999); // Include entire day
        dateFilter.lte = toDate;
      }
      if (!where.AND) where.AND = [];
      where.AND.push({ publicationDate: dateFilter });
    }
    if (hasPliegos) {
      if (!where.AND) where.AND = [];
      where.AND.push({ OR: [
        { technicalDocUrl: { not: null } },
        { adminDocUrl: { not: null } },
        { AND: [
          { documentsJson: { not: null } },
          { NOT: [{ documentsJson: '' }, { documentsJson: '[]' }, { documentsJson: '[]_checked' }] }
        ] }
      ] });
    }
    if (search) {
      if (!where.AND) where.AND = [];
      
      // Parse search: separate positive and negative keywords
      const terms = search.trim().split(/\s+/);
      const positive: string[] = [];
      const negative: string[] = [];
      
      terms.forEach(term => {
        if (term.startsWith('-') && term.length > 1) {
          negative.push(term.slice(1));
        } else if (term.length > 0) {
          positive.push(term);
        }
      });
      
      // Positive keywords (at least one must match)
      if (positive.length > 0) {
        const positiveSearch = positive.join(' ');
        where.AND.push({
          OR: [
            { title: { contains: positiveSearch, mode: 'insensitive' as any } },
            { description: { contains: positiveSearch, mode: 'insensitive' as any } },
            { contractingBody: { contains: positiveSearch, mode: 'insensitive' as any } },
          ],
        });
      }
      
      // Negative keywords (none must match)
      negative.forEach(neg => {
        where.AND.push({
          AND: [
            { title: { not: { contains: neg, mode: 'insensitive' as any } } },
            { description: { not: { contains: neg, mode: 'insensitive' as any } } },
          ],
        });
      });
    }
    if (contractType === 'minor') where.isMinorContract = true;
    else if (contractType === 'regular') where.isMinorContract = false;
    if (cpv) {
      if (!where.AND) where.AND = [];
      where.AND.push({ cpvCodes: { contains: cpv, mode: 'insensitive' as any } });
    }
    if (ccaa) where.regionCcaa = ccaa;
    if (category) where.classification = category;
    if (status) where.status = status;
    if (minScore > 0) where.score = { gte: minScore };
    if (minBudget > 0 || maxBudget < 999999999) {
      where.budgetAmount = { gte: minBudget, lte: maxBudget };
    }

    // Object filter: 'relevant' (default) = only compra+formacion, 'all' = everything
    const objectFilter = searchParams.get('objectFilter') ?? 'relevant';

    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    if (objectFilter === 'relevant') {
      // Fetch more than needed, then filter in-memory by object type
      const rawTenders = await prisma.tender.findMany({ where, orderBy, take: limit * 5 });
      const filtered = rawTenders.filter((t: any) => {
        const objType = getTenderObjectType(t.title, t.description);
        return objType === 'compra' || objType === 'formacion';
      });
      // Keep expired tenders visible but push them to the bottom (still ordered by score within each group)
      const isExpired = (t: any) => t.deadline && new Date(t.deadline) < now;
      const ordered = [...filtered.filter((t: any) => !isExpired(t)), ...filtered.filter(isExpired)];
      const paginated = ordered.slice(offset, offset + limit);
      // Add objectType to each tender for UI display
      const tendersWithType = paginated.map((t: any) => ({
        ...t,
        objectType: getTenderObjectType(t.title, t.description),
      }));
      return NextResponse.json({ tenders: tendersWithType, total: ordered.length });
    } else {
      const [tenders, total] = await Promise.all([
        prisma.tender.findMany({ where, orderBy, take: limit, skip: offset }),
        prisma.tender.count({ where }),
      ]);
      // Add objectType to each tender for UI display
      const tendersWithType = (tenders ?? []).map((t: any) => ({
        ...t,
        objectType: getTenderObjectType(t.title, t.description),
      }));
      return NextResponse.json({ tenders: tendersWithType, total: total ?? 0 });
    }
  } catch (error: any) {
    console.error('Tenders API error:', error);
    return NextResponse.json({ tenders: [], total: 0, error: 'Error al obtener licitaciones' }, { status: 500 });
  }
}
