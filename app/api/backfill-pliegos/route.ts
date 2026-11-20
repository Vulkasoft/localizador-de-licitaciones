export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { scrapePlacspDetail } from '@/lib/placsp-scraper';

/**
 * One-shot backfill: scrapes all tenders that have a PLACSP detail URL but no pliego URLs,
 * and populates technicalDocUrl / adminDocUrl from the rendered detail page.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const token = new URL(req.url).searchParams.get('token');
  if (!session?.user && token !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const tenders = await prisma.tender.findMany({
    where: {
      AND: [
        { OR: [{ technicalDocUrl: null }, { adminDocUrl: null }] },
        { sourceUrl: { contains: 'contrataciondelestado.es' } },
        { sourceUrl: { contains: 'idEvl=' } },
      ],
    },
  });

  const results: any[] = [];
  let updated = 0;

  for (const t of tenders) {
    try {
      const scraped = await scrapePlacspDetail(t.sourceUrl!);
      const updates: any = {};
      if (scraped.technicalDocUrl && !t.technicalDocUrl) updates.technicalDocUrl = scraped.technicalDocUrl;
      if (scraped.adminDocUrl && !t.adminDocUrl) updates.adminDocUrl = scraped.adminDocUrl;
      if (scraped.additionalDocs.length > 0 && !t.documentsJson) {
        updates.documentsJson = JSON.stringify(scraped.additionalDocs);
      }
      if (Object.keys(updates).length > 0) {
        await prisma.tender.update({ where: { id: t.id }, data: updates });
        updated++;
        results.push({ id: t.id, title: t.title.slice(0, 60), updates: Object.keys(updates), additional: scraped.additionalDocs.length });
      } else {
        results.push({ id: t.id, title: t.title.slice(0, 60), note: 'No pliego found' });
      }
    } catch (e: any) {
      results.push({ id: t.id, error: e?.message });
    }
  }

  return NextResponse.json({ scanned: tenders.length, updated, results });
}
