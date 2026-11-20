export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { fetchPLACSPTenders, PLACSPTender } from '@/lib/placsp';
import { scoreTender, classifyTender } from '@/lib/scoring';

/**
 * GET /api/placsp - Search PLACSP ATOM feed for drone-related tenders
 * Query params: month (YYYYMM), preview (true = don't save)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request?.url ?? '');
    const preview = searchParams.get('preview') === 'true';
    
    const now = new Date();
    const month = searchParams.get('month') || `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    const tenders = await fetchPLACSPTenders(month);
    
    if (preview) {
      return NextResponse.json({
        total: tenders.length,
        tenders: tenders.slice(0, 50).map(t => ({
          title: t.title,
          contractingBody: t.contractingBody,
          budget: t.budgetAmount,
          link: t.link,
          hasAdminDoc: !!t.adminDocUrl,
          hasTechDoc: !!t.technicalDocUrl,
          additionalDocs: t.additionalDocs.length,
        })),
      });
    }

    // Import into database
    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const t of tenders) {
      const scoring = scoreTender({
        title: t.title,
        description: t.summary,
        contractingBody: t.contractingBody,
        cpvCodes: t.cpvCodes,
        budgetAmount: t.budgetAmount,
        deadline: t.deadline,
        buyerType: null,
        lotsJson: null,
      });

      if (scoring.excluded) { skipped++; continue; }

      const classification = classifyTender({
        title: t.title,
        description: t.summary,
        cpvCodes: t.cpvCodes,
      });

      try {
        const existing = await prisma.tender.findFirst({
          where: { sourceId: t.sourceId },
        });

        if (existing) {
          // Always update document URLs and region if we have better data
          const updates: any = {};
          if (t.technicalDocUrl) updates.technicalDocUrl = t.technicalDocUrl;
          if (t.adminDocUrl) updates.adminDocUrl = t.adminDocUrl;
          if (t.link && (!existing.sourceUrl || existing.sourceUrl.includes('placeholder'))) updates.sourceUrl = t.link;
          if (t.regionCcaa && !existing.regionCcaa) updates.regionCcaa = t.regionCcaa;
          if (t.additionalDocs.length > 0) {
            updates.documentsJson = JSON.stringify(t.additionalDocs.map((url: string, i: number) => ({ name: `Documento ${i + 1}`, url })));
          }
          
          if (Object.keys(updates).length > 0) {
            await prisma.tender.update({ where: { id: existing.id }, data: updates });
            updated++;
          } else {
            skipped++;
          }
        } else {
          await prisma.tender.create({
            data: {
              source: 'PLACSP_ATOM',
              sourceId: t.sourceId,
              title: t.title,
              description: t.summary || null,
              contractingBody: t.contractingBody || 'Desconocido',
              cpvCodes: t.cpvCodes || null,
              budgetAmount: t.budgetAmount,
              deadline: t.deadline ? new Date(t.deadline) : null,
              publicationDate: t.publicationDate ? new Date(t.publicationDate) : new Date(),
              status: 'active',
              regionCcaa: t.regionCcaa || null,
              province: t.province || null,
              score: scoring.total,
              classification,
              category: classification,
              sourceUrl: t.link || null,
              technicalDocUrl: t.technicalDocUrl || null,
              adminDocUrl: t.adminDocUrl || null,
              documentsJson: t.additionalDocs.length > 0
                ? JSON.stringify(t.additionalDocs.map((url: string, i: number) => ({ name: `Documento ${i + 1}`, url })))
                : null,
            },
          });
          added++;
        }
      } catch (e: any) {
        // Skip duplicates or errors
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      total: tenders.length,
      added,
      updated,
      skipped,
      message: `PLACSP: ${added} nuevas, ${updated} actualizadas, ${skipped} omitidas de ${tenders.length} encontradas`,
    });
  } catch (error: any) {
    console.error('[PLACSP API] Error:', error);
    return NextResponse.json({ error: error?.message || 'Error al consultar PLACSP' }, { status: 500 });
  }
}
