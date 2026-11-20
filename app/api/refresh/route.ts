export const dynamic = 'force-dynamic';
import { prisma } from '@/lib/db';
import { scoreTender, classifyTender } from '@/lib/scoring';
import { fetchRecentPLACSPTenders } from '@/lib/placsp';
import { scrapePlacspDetail } from '@/lib/placsp-scraper';
import { requireSessionOrCron } from '@/lib/api-auth';

export async function POST(request: Request) {
  const denied = await requireSessionOrCron(request);
  if (denied) return denied;
  // Auto-close ONLY adjudicated/formalized tenders before refresh.
  // Expired-by-deadline tenders are intentionally kept (not removed automatically).
  const now = new Date();
  await prisma.tender.updateMany({
    where: { status: 'active', OR: [
      { tenderPhase: { in: ['adjudicada', 'formalizada'] } },
      { title: { contains: 'formalización contrato', mode: 'insensitive' } },
    ] },
    data: { status: 'closed' },
  }).catch(() => {});

  const log = await prisma.refreshLog.create({ data: { status: 'running' } });

  const stream = new ReadableStream({
    async start(controller: any) {
      const encoder = new TextEncoder();
      const send = (data: any) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
      };

      try {
        send({ status: 'processing', message: 'Conectando con la Plataforma de Contratación del Sector Público (PLACSP)...' });

        send({ status: 'processing', message: 'Descargando datos oficiales ATOM del mes actual...' });

        let placspTenders: any[] = [];
        try {
          placspTenders = await fetchRecentPLACSPTenders();
          send({ status: 'processing', message: `Encontradas ${placspTenders.length} licitaciones relevantes en PLACSP (licitaciones + contratos menores + plataformas agregadas). Procesando...` });
        } catch (e: any) {
          console.error('[Refresh] PLACSP error:', e);
          send({ status: 'processing', message: 'Error parcial con PLACSP, continuando con datos disponibles...' });
        }

        let added = 0;
        let updated = 0;

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
              // Always update document URLs and region if we have better data
              const updates: any = {};
              if (t.technicalDocUrl) updates.technicalDocUrl = t.technicalDocUrl;
              if (t.adminDocUrl) updates.adminDocUrl = t.adminDocUrl;
              if (t.link && (!existing.sourceUrl || existing.sourceUrl.includes('placeholder'))) updates.sourceUrl = t.link;
              if (t.regionCcaa && !existing.regionCcaa) updates.regionCcaa = t.regionCcaa;
              if (t.additionalDocs?.length > 0) {
                updates.documentsJson = JSON.stringify(t.additionalDocs.map((url: string, i: number) => ({ name: `Documento ${i + 1}`, url })));
              }
              // Determine correct phase - override based on title content
              let phase = t.tenderPhase ?? existing.tenderPhase;
              const titleLower = (t.title || existing.title || '').toLowerCase();
              if (titleLower.includes('adjudicaci') || titleLower.includes('adjudicada') || titleLower.includes('adjudicado')) phase = 'adjudicada';
              else if (titleLower.includes('formaliza')) phase = 'formalizada';
              if (phase && phase !== existing.tenderPhase) updates.tenderPhase = phase;
              if (t.awardedTo && !existing.awardedTo) updates.awardedTo = t.awardedTo;
              if (t.awardedAmount && !existing.awardedAmount) updates.awardedAmount = t.awardedAmount;
              if (t.awardedDate && !existing.awardedDate) updates.awardedDate = new Date(t.awardedDate);
              if (Object.keys(updates).length > 0) {
                await prisma.tender.update({ where: { id: existing.id }, data: updates });
                updated++;
              }
            } else {
              await prisma.tender.create({
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
                  tenderPhase: (() => {
                    const tl = (t.title || '').toLowerCase();
                    if (tl.includes('adjudicaci') || tl.includes('adjudicada') || tl.includes('adjudicado')) return 'adjudicada';
                    if (tl.includes('formaliza')) return 'formalizada';
                    return t.tenderPhase ?? 'licitacion';
                  })(),
                  awardedTo: t.awardedTo ?? null,
                  awardedAmount: t.awardedAmount ?? null,
                  awardedDate: t.awardedDate ? new Date(t.awardedDate) : null,
                },
              });
              added++;
            }
          } catch {}

          if (added % 10 === 0 && added > 0) {
            send({ status: 'processing', message: `Importadas ${added} licitaciones nuevas, ${updated} actualizadas...` });
          }
        }

        await prisma.refreshLog.update({
          where: { id: log?.id },
          data: { completedAt: new Date(), tendersFound: added, status: 'completed' },
        });

        // Re-score ALL existing tenders with latest scoring algorithm
        send({ status: 'processing', message: 'Recalculando puntuaciones de todas las licitaciones...' });
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

        // Auto-scrape PLACSP detail pages for tenders still missing pliegos
        send({ status: 'processing', message: 'Buscando pliegos faltantes en páginas oficiales de PLACSP...' });
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
        if (scraped > 0) send({ status: 'processing', message: `Pliegos completados vía scraping: ${scraped} licitaciones` });

        await prisma.setting.upsert({
          where: { key: 'last_refresh' },
          update: { value: new Date().toISOString() },
          create: { key: 'last_refresh', value: new Date().toISOString() },
        });

        send({ status: 'completed', result: { tendersFound: added, message: `PLACSP completado: ${added} nueva(s), ${updated} actualizada(s), ${rescored} repuntuada(s) de ${placspTenders.length} encontradas.` } });
      } catch (error: any) {
        console.error('Refresh error:', error);
        send({ status: 'error', message: 'Error durante la actualización' });
        await prisma.refreshLog.update({
          where: { id: log?.id },
          data: { completedAt: new Date(), status: 'error' },
        }).catch(() => {});
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
