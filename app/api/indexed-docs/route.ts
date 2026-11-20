export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

/**
 * GET /api/indexed-docs
 * Returns list of tenders that have documents indexed (documentsJson is not empty)
 * with document count and category breakdown
 * Query params:
 *   - search: filter by tender title or contracting body
 *   - ccaa: filter by CCAA
 *   - page: pagination (default 1)
 *   - limit: results per page (default 20, max 100)
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || '';
  const ccaa = searchParams.get('ccaa') || '';
  const cpv = searchParams.get('cpv') || '';
  const minBudget = searchParams.get('minBudget') ? parseFloat(searchParams.get('minBudget')!) : null;
  const maxBudget = searchParams.get('maxBudget') ? parseFloat(searchParams.get('maxBudget')!) : null;
  const minScore = searchParams.get('minScore') ? parseInt(searchParams.get('minScore')!) : null;
  const excludeCategories = searchParams.get('excludeCategories') || ''; // comma-separated
  const includeCategories = searchParams.get('includeCategories') || ''; // comma-separated
  const sortBy = searchParams.get('sortBy') || 'createdAt'; // createdAt, publicationDate, score, budgetAmount, deadline
  const sortDir = (searchParams.get('sortOrder') || 'desc') === 'asc' ? 'asc' as const : 'desc' as const;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
  const skip = (page - 1) * limit;

  try {
    // Build where clause
    const where: any = {
      AND: [
        // Exclude tenders in the trash (papelera)
        { dismissed: false },
        // Keep expired tenders too — they are never auto-removed by deadline
        { documentsJson: { not: null } },
        { documentsJson: { not: '' } },
        { documentsJson: { not: '[]' } },
        { documentsJson: { not: '[]_checked' } },
      ],
    };

    // Search filter
    if (search) {
      where.AND.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { contractingBody: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    // CCAA filter
    if (ccaa) {
      where.AND.push({ regionCcaa: ccaa });
    }

    // CPV filter
    if (cpv) {
      where.AND.push({ cpvCodes: { contains: cpv, mode: 'insensitive' } });
    }

    // Budget range filter
    if (minBudget !== null) {
      where.AND.push({ budgetAmount: { gte: minBudget } });
    }
    if (maxBudget !== null) {
      where.AND.push({ budgetAmount: { lte: maxBudget } });
    }

    // Score filter
    if (minScore !== null) {
      where.AND.push({ score: { gte: minScore } });
    }

    // Get total count
    const total = await prisma.tender.count({ where });

    // Build orderBy clause - use array for stable ordering with secondary sort
    const orderByMap: Record<string, any[]> = {
      createdAt: [{ createdAt: sortDir }],
      publicationDate: [{ publicationDate: sortDir }, { createdAt: 'desc' }],
      score: [{ score: sortDir }, { createdAt: 'desc' }],
      budgetAmount: [{ budgetAmount: sortDir }, { createdAt: 'desc' }],
      deadline: [{ deadline: sortDir === 'desc' ? 'asc' : 'desc' }, { createdAt: 'desc' }],
    };
    const orderBy = orderByMap[sortBy] || [{ createdAt: 'desc' }];

    // Fetch ALL matching tenders (we'll filter by document category in memory)
    // We can't do this in Prisma WHERE because documentsJson is a JSON string
    const allTenders = await prisma.tender.findMany({
      where,
      select: {
        id: true,
        title: true,
        contractingBody: true,
        regionCcaa: true,
        budgetAmount: true,
        publicationDate: true,
        deadline: true,
        documentsJson: true,
        technicalDocUrl: true,
        adminDocUrl: true,
        sourceUrl: true,
        score: true,
        createdAt: true,
      },
      orderBy,
    });

    // Filter by document categories in memory
    const excludeCats = excludeCategories ? excludeCategories.split(',').map(c => c.trim().toLowerCase()) : [];
    const includeCats = includeCategories ? includeCategories.split(',').map(c => c.trim().toLowerCase()) : [];

    let filteredTenders = allTenders;
    if (excludeCats.length > 0 || includeCats.length > 0) {
      filteredTenders = allTenders.filter(t => {
        let docs: any[] = [];
        try {
          docs = JSON.parse(t.documentsJson || '[]');
        } catch {}
        
        const docCategories = docs.map(d => (d.category || 'otros').toLowerCase());
        
        // Exclude: if ANY doc matches excluded categories, skip this tender
        // Normalize: strip accents for comparison to handle adjudicacion/adjudicación etc.
        if (excludeCats.length > 0) {
          const normalizeStr = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
          const excludeNorm = excludeCats.map(normalizeStr);
          const hasExcluded = docCategories.some(cat => {
            const catNorm = normalizeStr(cat);
            return excludeNorm.some(ex => catNorm.includes(ex) || ex.includes(catNorm));
          });
          if (hasExcluded) return false;
        }
        
        // Include: if set, tender must have at least ONE doc in included categories
        if (includeCats.length > 0) {
          const normalizeStr2 = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
          const includeNorm = includeCats.map(normalizeStr2);
          const hasIncluded = docCategories.some(cat => {
            const catNorm = normalizeStr2(cat);
            return includeNorm.some(inc => catNorm.includes(inc) || inc.includes(catNorm));
          });
          if (!hasIncluded) return false;
        }
        
        return true;
      });
    }

    // Apply pagination AFTER filtering
    const totalFiltered = filteredTenders.length;
    const tenders = filteredTenders.slice(skip, skip + limit);

    // Parse documents and add metadata
    const tendersWithDocs = tenders.map(t => {
      let allDocs: any[] = [];
      try {
        allDocs = JSON.parse(t.documentsJson || '[]');
      } catch {}

      // Count by category
      const categoryCount: Record<string, number> = {};
      allDocs.forEach(doc => {
        const cat = doc.category || 'otros';
        categoryCount[cat] = (categoryCount[cat] || 0) + 1;
      });

      return {
        ...t,
        ccaa: t.regionCcaa,
        documentCount: allDocs.length,
        categoryBreakdown: categoryCount,
        hasTechnicalDoc: !!t.technicalDocUrl,
        hasAdminDoc: !!t.adminDocUrl,
      };
    });

    return NextResponse.json({
      tenders: tendersWithDocs,
      pagination: {
        page,
        limit,
        total: totalFiltered,
        totalPages: Math.ceil(totalFiltered / limit),
      },
    });
  } catch (e: any) {
    console.error('[indexed-docs] Error:', e);
    return NextResponse.json({ error: 'Error interno', detail: e?.message }, { status: 500 });
  }
}
