export const dynamic = 'force-dynamic';
export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { fetchPLACSPTenders, PLACSPTender } from '@/lib/placsp';
import { scoreTender, classifyTender } from '@/lib/scoring';
import { detectRegionFromText } from '@/lib/placsp';

/**
 * POST /api/backfill
 * Historical backfill of drone tenders from PLACSP feeds.
 * Imports data from the last N months (default 12) across all feed sources.
 * This endpoint should be called once to populate historical data for the Competitors tab.
 * 
 * Query params:
 *   - months: number of months to go back (default 12, max 24)
 *   - feed: specific feed to process ('main' | 'minor' | 'aggregated' | 'encargos' | 'cpm' | 'all')
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const monthsBack = Math.min(body.months || 12, 24);
  const feedFilter = body.feed || 'all';

  try {
    const now = new Date();
    const results: { ym: string; feed: string; found: number; imported: number; error?: string }[] = [];
    let totalImported = 0;
    let totalFound = 0;

    // Generate list of year-months to process
    const yearMonths: string[] = [];
    for (let i = 0; i < monthsBack; i++) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      yearMonths.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    // Feed definitions
    const feedDefs: { key: string; urlPattern: string; label: string; isMinor: boolean; phaseOverride?: string }[] = [
      { key: 'main', urlPattern: 'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3_{{YM}}.zip', label: 'licitaciones', isMinor: false },
      { key: 'minor', urlPattern: 'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_1143/contratosMenoresPerfilesContratantes_{{YM}}.zip', label: 'contratos_menores', isMinor: true },
      { key: 'aggregated', urlPattern: 'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_644/licitacionesAgregadas_{{YM}}.zip', label: 'plataformas_agregadas', isMinor: false },
      { key: 'encargos', urlPattern: 'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_1383/encargosMediosPropios_{{YM}}.zip', label: 'encargos_medios_propios', isMinor: false },
    ];

    const activeFeedDefs = feedFilter === 'all' ? feedDefs : feedDefs.filter(f => f.key === feedFilter);

    for (const ym of yearMonths) {
      for (const feed of activeFeedDefs) {
        const url = feed.urlPattern.replace('{{YM}}', ym);
        try {
          console.log(`[backfill] Fetching ${feed.label} ${ym}...`);
          const tenders = await fetchPLACSPTenders(ym, url, feed.label, feed.isMinor, feed.phaseOverride);
          totalFound += tenders.length;

          let imported = 0;
          for (const t of tenders) {
            try {
              const existing = await prisma.tender.findFirst({ where: { sourceId: t.sourceId } });
              if (existing) {
                // Update awardee info if available and not set
                if (t.awardedTo && !existing.awardedTo) {
                  await prisma.tender.update({
                    where: { id: existing.id },
                    data: {
                      awardedTo: t.awardedTo,
                      awardedAmount: t.awardedAmount,
                      awardedDate: t.awardedDate ? new Date(t.awardedDate) : undefined,
                      tenderPhase: t.tenderPhase || existing.tenderPhase,
                    },
                  });
                }
                continue;
              }

              const tenderObj = { title: t.title, description: t.summary, cpvCodes: t.cpvCodes, contractingBody: t.contractingBody, budgetAmount: t.budgetAmount };
              const scoreResult = scoreTender(tenderObj);
              const classification = classifyTender(tenderObj);

              await prisma.tender.create({
                data: {
                  source: 'PLACSP',
                  sourceId: t.sourceId,
                  title: t.title,
                  description: t.summary,
                  contractingBody: t.contractingBody,
                  budgetAmount: t.budgetAmount,
                  budgetCurrency: 'EUR',
                  cpvCodes: t.cpvCodes,
                  status: t.status === 'active' ? 'active' : t.status,
                  publicationDate: t.publicationDate ? new Date(t.publicationDate) : null,
                  deadline: t.deadline ? new Date(t.deadline) : null,
                  sourceUrl: t.link,
                  technicalDocUrl: t.technicalDocUrl,
                  adminDocUrl: t.adminDocUrl,
                  regionCcaa: t.regionCcaa || detectRegionFromText(`${t.contractingBody} ${t.title}`),
                  score: scoreResult.total,
                  classification,
                  isMinorContract: feed.isMinor || t.isMinorContract || false,
                  tenderPhase: t.tenderPhase || 'licitacion',
                  awardedTo: t.awardedTo,
                  awardedAmount: t.awardedAmount,
                  awardedDate: t.awardedDate ? new Date(t.awardedDate) : null,
                },
              });
              imported++;
            } catch (e: any) {
              // Skip duplicate / constraint errors
              if (!e?.message?.includes('Unique constraint')) {
                console.warn(`[backfill] Error importing tender ${t.sourceId}:`, e?.message);
              }
            }
          }

          totalImported += imported;
          results.push({ ym, feed: feed.label, found: tenders.length, imported });
        } catch (e: any) {
          console.warn(`[backfill] Error fetching ${feed.label} ${ym}:`, e?.message);
          results.push({ ym, feed: feed.label, found: 0, imported: 0, error: e?.message });
        }
      }
    }

    // Also process CPM (annual feeds)
    if (feedFilter === 'all' || feedFilter === 'cpm') {
      const years = new Set(yearMonths.map(ym => ym.substring(0, 4)));
      for (const y of years) {
        const cpmUrl = `https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_1403/CPM_SectorPublico_${y}.zip`;
        try {
          const tenders = await fetchPLACSPTenders(y, cpmUrl, 'consultas_preliminares', false, 'pre_licitacion');
          totalFound += tenders.length;
          let imported = 0;
          for (const t of tenders) {
            const existing = await prisma.tender.findFirst({ where: { sourceId: t.sourceId } });
            if (existing) continue;
            const tenderObj2 = { title: t.title, description: t.summary, cpvCodes: t.cpvCodes, contractingBody: t.contractingBody, budgetAmount: t.budgetAmount };
            const scoreResult = scoreTender(tenderObj2);
            const classification = classifyTender(tenderObj2);
            try {
              await prisma.tender.create({
                data: {
                  source: 'PLACSP', sourceId: t.sourceId, title: t.title, description: t.summary,
                  contractingBody: t.contractingBody, budgetAmount: t.budgetAmount, budgetCurrency: 'EUR',
                  cpvCodes: t.cpvCodes, status: t.status === 'active' ? 'active' : t.status,
                  publicationDate: t.publicationDate ? new Date(t.publicationDate) : null,
                  deadline: t.deadline ? new Date(t.deadline) : null,
                  sourceUrl: t.link, technicalDocUrl: t.technicalDocUrl, adminDocUrl: t.adminDocUrl,
                  regionCcaa: t.regionCcaa || detectRegionFromText(`${t.contractingBody} ${t.title}`),
                  score: scoreResult.total, classification, isMinorContract: false,
                  tenderPhase: 'pre_licitacion', awardedTo: t.awardedTo,
                  awardedAmount: t.awardedAmount, awardedDate: t.awardedDate ? new Date(t.awardedDate) : null,
                },
              });
              imported++;
            } catch (e: any) { /* skip duplicates */ }
          }
          totalImported += imported;
          results.push({ ym: y, feed: 'cpm', found: tenders.length, imported });
        } catch (e: any) {
          results.push({ ym: y, feed: 'cpm', found: 0, imported: 0, error: e?.message });
        }
      }
    }

    return NextResponse.json({
      monthsProcessed: yearMonths.length,
      feedsProcessed: activeFeedDefs.length,
      totalFound,
      totalImported,
      results,
    });
  } catch (e: any) {
    console.error('[backfill] Fatal error:', e);
    return NextResponse.json({ error: 'Error interno', detail: e?.message }, { status: 500 });
  }
}
