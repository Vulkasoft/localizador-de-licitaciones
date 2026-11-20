export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min max
import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrCron } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { scrapePlacspDetail } from '@/lib/placsp-scraper';

/**
 * POST /api/enrich-docs
 * Batch-scrape PLACSP detail pages for tenders missing documents.
 * Processes up to 20 tenders per call (throttled).
 * Query params:
 *   - limit: number of tenders to process (default 20, max 50)
 *   - force: if 'true', re-scrape even tenders that already have some docs
 *   - tenderId: if provided, scrape only this specific tender
 */
export async function POST(req: NextRequest) {
  // Auth: session OR Bearer ALARM_CRON_SECRET (for scheduled tasks)
  const denied = await requireSessionOrCron(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(body.limit || 200, 500);
  const force = body.force === true;
  const specificId = body.tenderId as string | undefined;
  const now = new Date();

  try {
    // Only index ACTIVE tenders (deadline in the future or no deadline)
    const activeFilter = {
      OR: [{ deadline: { gte: now } }, { deadline: null }],
    };

    // Find tenders that need document enrichment
    let tenders;
    if (specificId) {
      tenders = await prisma.tender.findMany({
        where: { id: specificId },
        select: { id: true, sourceUrl: true, technicalDocUrl: true, adminDocUrl: true, documentsJson: true },
      });
    } else if (force) {
      tenders = await prisma.tender.findMany({
        where: {
          sourceUrl: { not: null },
          dismissed: false,
          ...activeFilter,
        },
        select: { id: true, sourceUrl: true, technicalDocUrl: true, adminDocUrl: true, documentsJson: true },
        orderBy: { score: 'desc' },
        take: limit,
      });
    } else {
      // Only active tenders with no documents, prioritized by score
      tenders = await prisma.tender.findMany({
        where: {
          AND: [
            { sourceUrl: { not: null } },
            { dismissed: false },
            { OR: [{ deadline: { gte: now } }, { deadline: null }] },
            { OR: [{ documentsJson: null }, { documentsJson: '' }, { documentsJson: '[]' }] },
          ],
        },
        select: { id: true, sourceUrl: true, technicalDocUrl: true, adminDocUrl: true, documentsJson: true },
        orderBy: { score: 'desc' },
        take: limit,
      });
    }

    const results: { id: string; docsFound: number; techFound: boolean; adminFound: boolean }[] = [];
    let enriched = 0;
    let errors = 0;
    const remaining = await prisma.tender.count({
      where: {
        AND: [
          { sourceUrl: { not: null } },
          { dismissed: false },
          { OR: [{ deadline: { gte: now } }, { deadline: null }] },
          { OR: [{ documentsJson: null }, { documentsJson: '' }, { documentsJson: '[]' }] },
        ],
      },
    });

    // Process in parallel batches of 25 for maximum speed
    const BATCH_SIZE = 25;
    for (let i = 0; i < tenders.length; i += BATCH_SIZE) {
      const batch = tenders.slice(i, i + BATCH_SIZE);
      
      await Promise.allSettled(
        batch.map(async (t) => {
          if (!t.sourceUrl?.includes('contrataciondelestado.es')) return;

          try {
            const scraped = await scrapePlacspDetail(t.sourceUrl);
            
            const updates: any = {};
            let techFound = false;
            let adminFound = false;

            if (scraped.technicalDocUrl && !t.technicalDocUrl) {
              updates.technicalDocUrl = scraped.technicalDocUrl;
              techFound = true;
            }
            if (scraped.adminDocUrl && !t.adminDocUrl) {
              updates.adminDocUrl = scraped.adminDocUrl;
              adminFound = true;
            }

            if (scraped.allDocuments.length > 0) {
              updates.documentsJson = JSON.stringify(scraped.allDocuments);
            }

            // Mark as processed even if no docs found (empty array)
            if (Object.keys(updates).length > 0) {
              await prisma.tender.update({ where: { id: t.id }, data: updates });
              enriched++;
            } else {
              // Mark as checked with empty array so we don't re-scrape
              await prisma.tender.update({ where: { id: t.id }, data: { documentsJson: '[]_checked' } });
            }

            results.push({ id: t.id, docsFound: scraped.allDocuments.length, techFound, adminFound });
          } catch (e: any) {
            errors++;
            results.push({ id: t.id, docsFound: 0, techFound: false, adminFound: false });
          }
        })
      );

      // Tiny delay between batches
      if (i + BATCH_SIZE < tenders.length) {
        await new Promise(r => setTimeout(r, 150));
      }
    }

    return NextResponse.json({
      processed: tenders.length,
      enriched,
      errors,
      remaining: remaining - enriched,
      results,
    });
  } catch (e: any) {
    console.error('[enrich-docs] Fatal error:', e);
    return NextResponse.json({ error: 'Error interno', detail: e?.message }, { status: 500 });
  }
}
