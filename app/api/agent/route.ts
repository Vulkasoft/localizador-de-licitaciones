export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * Endpoint para el agente externo (ChatGPT) de presupuestos.
 * - Se activa/desactiva desde Ajustes (setting: agent_enabled).
 * - Requiere autenticación: cabecera "x-agent-key" (o "Authorization: Bearer ...")
 *   con el identificador de canal guardado en el backend (CHATGPT_AGENT_CHANNEL_ID).
 * Devuelve licitaciones con sus enlaces a pliegos para que el agente los lea.
 */

function extractKey(request: Request): string {
  const direct = request.headers.get('x-agent-key') ?? '';
  if (direct) return direct.trim();
  const auth = request.headers.get('authorization') ?? '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return '';
}

export async function GET(request: Request) {
  try {
    // 1) Verificar credencial del agente (guardada en backend, nunca en cliente).
    //    Clave principal: AGENT_API_KEY. Se acepta el identificador antiguo por compatibilidad.
    const validKeys = [process.env.AGENT_API_KEY, process.env.CHATGPT_AGENT_CHANNEL_ID].filter(Boolean) as string[];
    const provided = extractKey(request);
    if (validKeys.length === 0 || !provided || !validKeys.includes(provided)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // 2) Verificar que el agente está activado en Ajustes
    const setting = await prisma.setting.findUnique({ where: { key: 'agent_enabled' } });
    if (setting?.value !== 'true') {
      return NextResponse.json(
        { error: 'El agente está desactivado. Actívalo desde Ajustes en la plataforma.' },
        { status: 403 }
      );
    }

    // 3) Parámetros opcionales de consulta
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 200);
    const minScore = parseInt(searchParams.get('minScore') ?? '0', 10) || 0;
    const region = searchParams.get('region') ?? undefined;
    const q = searchParams.get('q') ?? undefined;
    const id = searchParams.get('id') ?? undefined;

    const where: any = { dismissed: false };
    if (id) where.id = id;
    if (minScore > 0) where.score = { gte: minScore };
    if (region) where.regionCcaa = region;
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { contractingBody: { contains: q, mode: 'insensitive' } },
      ];
    }

    const tenders = await prisma.tender.findMany({
      where,
      orderBy: [{ score: 'desc' }, { publicationDate: 'desc' }],
      take: limit,
      select: {
        id: true, sourceId: true, title: true, description: true,
        contractingBody: true, buyerType: true, cpvCodes: true,
        budgetAmount: true, budgetCurrency: true, deadline: true,
        publicationDate: true, status: true, tenderPhase: true,
        regionCcaa: true, province: true, municipality: true,
        category: true, classification: true, score: true,
        sourceUrl: true, adminDocUrl: true, technicalDocUrl: true,
        cachedAdminDocUrl: true, cachedTechnicalDocUrl: true,
        documentsJson: true, lotsJson: true, isMinorContract: true,
        awardedAmount: true, awardedTo: true,
      },
    });

    const items = (tenders ?? []).map((t: any) => {
      let documents: any[] = [];
      try { documents = t?.documentsJson ? JSON.parse(t.documentsJson) : []; } catch { documents = []; }
      let lots: any[] = [];
      try { lots = t?.lotsJson ? JSON.parse(t.lotsJson) : []; } catch { lots = []; }
      const { documentsJson, lotsJson, ...rest } = t ?? {};
      return {
        ...rest,
        pliegos: {
          tecnico: t?.cachedTechnicalDocUrl || t?.technicalDocUrl || null,
          administrativo: t?.cachedAdminDocUrl || t?.adminDocUrl || null,
        },
        documents,
        lots,
      };
    });

    return NextResponse.json({ count: items.length, tenders: items });
  } catch (error: any) {
    console.error('[api/agent] error:', error?.message ?? error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
