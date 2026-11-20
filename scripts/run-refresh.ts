import { prisma } from '@/lib/db';
import { scoreTender, classifyTender } from '@/lib/scoring';
import { fetchRecentPLACSPTenders } from '@/lib/placsp';
import { scrapePlacspDetail } from '@/lib/placsp-scraper';

async function main() {
  const log = await prisma.refreshLog.create({ data: { status: 'running' } });
  console.log(`[Refresh] Started, logId=${log.id}`);

  let added = 0;
  let updated = 0;

  try {
    console.log('[Refresh] Fetching PLACSP tenders...');
    const placspTenders = await fetchRecentPLACSPTenders();
    console.log(`[Refresh] Found ${placspTenders.length} tenders`);

    for (const t of placspTenders) {
      if (!t?.title) continue;
      const scoring = scoreTender({
        title: t.title,
        description: t.summary || t.description || '',
        contractingBody: t.contractingBody,
        cpvCodes: t.cpvCodes,
        budgetAmount: t.budgetAmount,
        deadline: t.deadline,
        buyerType: null,
        lotsJson: null,
      });
      if (scoring.excluded) continue;
      const classification = classifyTender({
        title: t.title,
        description: t.summary || t.description || '',
        cpvCodes: t.cpvCodes,
      });

      try {
        const existing = await prisma.tender.findFirst({ where: { sourceId: t.sourceId } });

        if (existing) {
          const updates: any = {};
          if (t.technicalDocUrl) updates.technicalDocUrl = t.technicalDocUrl;
          if (t.adminDocUrl) updates.adminDocUrl = t.adminDocUrl;
          if (t.link && (!existing.sourceUrl || existing.sourceUrl.includes('placeholder'))) updates.sourceUrl = t.link;
          if (t.regionCcaa && !existing.regionCcaa) updates.regionCcaa = t.regionCcaa;
          if (t.additionalDocs?.length > 0) {
            updates.documentsJson = JSON.stringify(t.additionalDocs.map((url: string, i: number) => ({ name: `Documento ${i + 1}`, url })));
          }
          if (t.tenderPhase && t.tenderPhase !== existing.tenderPhase) updates.tenderPhase = t.tenderPhase;
          if (t.awardedTo && !existing.awardedTo) updates.awardedTo = t.awardedTo;
          if (t.awardedAmount && !existing.awardedAmount) updates.awardedAmount = t.awardedAmount;
          if (t.awardedDate && !existing.awardedDate) updates.awardedDate = new Date(t.awardedDate);
          if (Object.keys(updates).length > 0) {
            await prisma.tender.update({ where: { id: existing.id }, data: updates });
            updated++;
          }
        } else {
          const newTender = await prisma.tender.create({
            data: {
              source: 'PLACSP',
              sourceId: t.sourceId,
              title: t.title ?? '',
              description: t.summary || t.description || '',
              contractingBody: t.contractingBody ?? 'Desconocido',
              buyerType: null,
              cpvCodes: t.cpvCodes ?? null,
              budgetAmount: t.budgetAmount || null,
              deadline: t.deadline ? new Date(t.deadline) : null,
              publicationDate: t.publicationDate ? new Date(t.publicationDate) : new Date(),
              status: 'active',
              regionCcaa: t.regionCcaa ?? null,
              province: t.province ?? null,
              score: scoring.total,
              classification,
              category: classification,
              sourceUrl: t.link ?? null,
              technicalDocUrl: t.technicalDocUrl ?? null,
              adminDocUrl: t.adminDocUrl ?? null,
              documentsJson: t.additionalDocs?.length > 0
                ? JSON.stringify(t.additionalDocs.map((url: string, i: number) => ({ name: `Documento ${i + 1}`, url })))
                : null,
              isMinorContract: t.isMinorContract ?? false,
              tenderPhase: t.tenderPhase ?? 'licitacion',
              awardedTo: t.awardedTo ?? null,
              awardedAmount: t.awardedAmount ?? null,
              awardedDate: t.awardedDate ? new Date(t.awardedDate) : null,
            },
          });
          added++;

          // Upsert buyer
          await prisma.buyer.upsert({
            where: { name: t.contractingBody ?? 'Desconocido' },
            update: { tenderCount: { increment: 1 } },
            create: {
              name: t.contractingBody ?? 'Desconocido',
              type: null,
              region: t.regionCcaa ?? null,
              province: t.province ?? null,
              tenderCount: 1,
            },
          });

          // Create notification for high-relevance tenders
          if (scoring.total > 60) {
            await prisma.notification.create({
              data: {
                type: 'new_tender',
                title: `Nueva licitación relevante: ${t.title.substring(0, 80)}`,
                message: `Puntuación: ${scoring.total}. Categoría: ${classification}. Organismo: ${t.contractingBody ?? 'Desconocido'}. Presupuesto: ${t.budgetAmount ? t.budgetAmount + '€' : 'N/A'}`,
                tenderId: newTender.id,
                isRead: false,
              },
            });
            console.log(`[Refresh] Notification created for tender ${newTender.id} (score=${scoring.total})`);
          }
        }
      } catch (e) {
        console.error('[Refresh] Error processing tender:', e);
      }
    }

    // Re-score all existing tenders
    console.log('[Refresh] Re-scoring all existing tenders...');
    let rescored = 0;
    const allTenders = await prisma.tender.findMany();
    for (const existing of allTenders) {
      try {
        const scoring = scoreTender({
          title: existing.title,
          description: existing.description ?? '',
          contractingBody: existing.contractingBody ?? '',
          cpvCodes: existing.cpvCodes ?? '',
          budgetAmount: existing.budgetAmount,
          deadline: existing.deadline,
          buyerType: existing.buyerType,
          lotsJson: existing.lotsJson ?? null,
        });
        const newClass = classifyTender({
          title: existing.title,
          description: existing.description ?? '',
          cpvCodes: existing.cpvCodes ?? '',
        });
        if (existing.score !== scoring.total || existing.classification !== newClass) {
          await prisma.tender.update({
            where: { id: existing.id },
            data: { score: scoring.total, classification: newClass, category: newClass },
          });
          rescored++;
        }
      } catch {}
    }

    // Auto-scrape missing pliegos
    console.log('[Refresh] Scraping missing pliegos...');
    const missing = await prisma.tender.findMany({
      where: {
        AND: [
          { OR: [{ technicalDocUrl: null }, { adminDocUrl: null }] },
          { sourceUrl: { contains: 'idEvl=' } },
        ],
      },
      take: 30,
    });
    let scraped = 0;
    for (const tt of missing) {
      try {
        const sc = await scrapePlacspDetail(tt.sourceUrl!);
        const upd: any = {};
        if (sc.technicalDocUrl && !tt.technicalDocUrl) upd.technicalDocUrl = sc.technicalDocUrl;
        if (sc.adminDocUrl && !tt.adminDocUrl) upd.adminDocUrl = sc.adminDocUrl;
        if (sc.additionalDocs.length > 0 && !tt.documentsJson) upd.documentsJson = JSON.stringify(sc.additionalDocs);
        if (Object.keys(upd).length > 0) {
          await prisma.tender.update({ where: { id: tt.id }, data: upd });
          scraped++;
        }
      } catch {}
    }

    await prisma.refreshLog.update({
      where: { id: log.id },
      data: { completedAt: new Date(), tendersFound: added, status: 'completed' },
    });

    await prisma.setting.upsert({
      where: { key: 'last_refresh' },
      update: { value: new Date().toISOString() },
      create: { key: 'last_refresh', value: new Date().toISOString() },
    });

    console.log(`[Refresh] Completed: ${added} new, ${updated} updated, ${rescored} rescored, ${scraped} scraped.`);
    process.exit(0);
  } catch (error: any) {
    console.error('[Refresh] Fatal error:', error);
    await prisma.refreshLog.update({
      where: { id: log.id },
      data: { completedAt: new Date(), status: 'failed' },
    }).catch(() => {});
    process.exit(1);
  }
}

main();
