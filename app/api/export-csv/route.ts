export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/api-auth';
import { getTenderObjectType } from '@/lib/scoring';

export async function GET(request: Request) {
  const auth = await requireSession();
  if (auth.response) return auth.response;

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
    const expiring = searchParams.get('expiring') === 'true';
    const newOnly = searchParams.get('new') === 'true';
    const hasPliegos = searchParams.get('pliegos') === 'true';
    const showExpired = searchParams.get('showExpired') === 'true';
    const contractType = searchParams.get('contractType') ?? '';
    const cpv = searchParams.get('cpv') ?? '';
    const sourceFilter = searchParams.get('sourceFilter') ?? 'official';
    const phaseFilter = searchParams.get('phaseFilter') ?? 'active';
    const dateRange = searchParams.get('dateRange') ?? '';
    const dateFrom = searchParams.get('dateFrom') ?? '';
    const dateTo = searchParams.get('dateTo') ?? '';

    // Build where clause (same logic as /api/tenders)
    const where: any = { dismissed: false };
    const now = new Date();
    if (expiring) {
      const in14 = new Date(); in14.setDate(in14.getDate() + 14);
      where.status = 'active';
      where.deadline = { gte: now, lte: in14 };
    } else if (!showExpired) {
      // Keep expired tenders in the export too (never auto-removed by deadline)
      if (!where.AND) where.AND = [];
      where.AND.push({ classification: { not: 'espectaculo_ocio' } });
    }
    if (newOnly) {
      const since = new Date(); since.setDate(since.getDate() - 7);
      where.publicationDate = { gte: since };
    }
    // Source filter
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
    // Phase filter
    if (phaseFilter === 'active') {
      if (!where.AND) where.AND = [];
      where.AND.push({ tenderPhase: { in: ['licitacion', 'pre_licitacion'] } });
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
      if (dateTo) { const toDate = new Date(dateTo); toDate.setHours(23, 59, 59, 999); dateFilter.lte = toDate; }
      if (!where.AND) where.AND = [];
      where.AND.push({ publicationDate: dateFilter });
    }
    if (hasPliegos) {
      if (!where.AND) where.AND = [];
      where.AND.push({ OR: [{ technicalDocUrl: { not: null } }, { adminDocUrl: { not: null } }] });
    }
    if (search) {
      if (!where.AND) where.AND = [];
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

    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    // Object type filter
    const objectFilter = searchParams.get('objectFilter') ?? 'relevant';

    // Fetch all matching tenders (no limit for export)
    let tenders = await prisma.tender.findMany({ 
      where, 
      orderBy,
      take: 2000 // Safety limit
    });

    // Apply object-type filter in memory
    tenders = tenders.map(t => ({
      ...t,
      objectType: getTenderObjectType(t.title, (t as any).description ?? ''),
    }));
    if (objectFilter === 'relevant') {
      tenders = tenders.filter((t: any) => t.objectType === 'compra' || t.objectType === 'formacion');
    }

    // Generate CSV
    const csvRows: string[] = [];
    
    // Header
    csvRows.push('Título,Organismo,CCAA,Presupuesto (€),Plazo,Publicación,Puntuación,Categoría,Tipo Objeto,Tipo Contrato,CPV,URL');
    
    // Data rows
    tenders.forEach(t => {
      const row = [
        escapeCsvValue(t.title),
        escapeCsvValue(t.contractingBody),
        escapeCsvValue(t.regionCcaa || ''),
        t.budgetAmount?.toFixed(2) || '',
        t.deadline ? new Date(t.deadline).toLocaleDateString('es-ES') : '',
        t.publicationDate ? new Date(t.publicationDate).toLocaleDateString('es-ES') : '',
        t.score.toString(),
        escapeCsvValue(t.classification || ''),
        escapeCsvValue((t as any).objectType === 'compra' ? 'Compra/Suministro' : (t as any).objectType === 'formacion' ? 'Formación' : (t as any).objectType === 'servicio' ? 'Servicio' : 'Otro'),
        t.isMinorContract ? 'Menor' : 'Regular',
        escapeCsvValue(t.cpvCodes || ''),
        escapeCsvValue(t.sourceUrl || '')
      ];
      csvRows.push(row.join(','));
    });

    const csv = csvRows.join('\n');
    
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="licitaciones_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error: any) {
    console.error('Export CSV error:', error);
    return NextResponse.json({ error: 'Error al exportar CSV' }, { status: 500 });
  }
}

function escapeCsvValue(val: string): string {
  if (!val) return '';
  // If value contains comma, quote, or newline, wrap in quotes and escape quotes
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}