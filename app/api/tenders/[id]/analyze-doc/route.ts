export const dynamic = 'force-dynamic';
export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { buildKey, uploadBuffer, getSignedDownloadUrl, objectExists } from '@/lib/s3';
import { scrapePlacspDetail } from '@/lib/placsp-scraper';

/**
 * Analiza un pliego (técnico o administrativo) de una licitación con IA.
 * Descarga/lee el PDF (cache S3 o fuente PLACSP), lo envía al modelo y devuelve
 * un resumen en español de qué hay que presentar, requisitos, plazos, etc.
 */

async function getPdfBuffer(tenderId: string, doc: 'technical' | 'admin'): Promise<{ buffer: Buffer } | { error: string; status: number }> {
  let tender = await prisma.tender.findUnique({ where: { id: tenderId } });
  if (!tender) return { error: 'Licitación no encontrada', status: 404 };

  let cachedKey: string | null = doc === 'technical' ? tender.cachedTechnicalDocUrl : tender.cachedAdminDocUrl;
  let sourceUrl: string | null = doc === 'technical' ? tender.technicalDocUrl : tender.adminDocUrl;

  // 1) Intento desde cache S3
  if (cachedKey) {
    try {
      if (await objectExists(cachedKey)) {
        const signed = await getSignedDownloadUrl(cachedKey);
        const r = await fetch(signed, { signal: AbortSignal.timeout(45000) });
        if (r.ok) {
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf.length > 4 && buf[0] === 0x25 && buf[1] === 0x50) return { buffer: buf };
        }
      }
    } catch (e) { console.warn('[analyze-doc] cache fetch failed', e); }
  }

  // 2) Descubrir sourceUrl scrapeando PLACSP si falta
  if (!sourceUrl && tender.sourceUrl?.includes('contrataciondelestado.es') && tender.sourceUrl.includes('idEvl=')) {
    try {
      const scraped = await scrapePlacspDetail(tender.sourceUrl);
      const updates: any = {};
      if (scraped.technicalDocUrl && !tender.technicalDocUrl) updates.technicalDocUrl = scraped.technicalDocUrl;
      if (scraped.adminDocUrl && !tender.adminDocUrl) updates.adminDocUrl = scraped.adminDocUrl;
      if (scraped.allDocuments.length > 0) updates.documentsJson = JSON.stringify(scraped.allDocuments);
      if (Object.keys(updates).length > 0) {
        tender = await prisma.tender.update({ where: { id: tenderId }, data: updates });
        sourceUrl = doc === 'technical' ? tender.technicalDocUrl : tender.adminDocUrl;
      }
    } catch (e: any) { console.warn('[analyze-doc] scrape failed', e?.message); }
  }

  if (!sourceUrl) return { error: 'Documento no disponible para esta licitación', status: 404 };

  // 3) Descargar desde la fuente oficial (con reintentos) y cachear
  let buffer: Buffer | null = null; let lastErr: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(sourceUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/pdf,application/octet-stream,*/*',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(45000),
        redirect: 'follow',
      });
      if (!r.ok) { lastErr = `HTTP ${r.status}`; continue; }
      buffer = Buffer.from(await r.arrayBuffer());
      break;
    } catch (e: any) { lastErr = e?.message ?? String(e); }
  }

  if (!buffer) return { error: 'No se pudo obtener el documento del servidor oficial.', status: 502 };

  const isPdf = buffer.length > 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  if (!isPdf) return { error: 'El servidor oficial devolvió contenido no-PDF', status: 502 };

  // Cachear para futuras descargas/análisis
  try {
    const filename = `${doc === 'technical' ? 'Pliego_Tecnico' : 'Pliego_Administrativo'}_${tenderId}.pdf`;
    const key = buildKey(`pliegos/${tenderId}/${doc}.pdf`);
    await uploadBuffer(key, buffer, 'application/pdf', filename);
    await prisma.tender.update({
      where: { id: tenderId },
      data: doc === 'technical' ? { cachedTechnicalDocUrl: key } : { cachedAdminDocUrl: key },
    });
  } catch (e) { console.warn('[analyze-doc] cache upload failed', e); }

  return { buffer };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  if (!process.env.ABACUSAI_API_KEY) {
    return NextResponse.json({ error: 'El servicio de IA no está configurado.' }, { status: 500 });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const doc = body?.doc as 'technical' | 'admin';
  if (!doc || !['technical', 'admin'].includes(doc)) {
    return NextResponse.json({ error: "Parámetro 'doc' (technical|admin) requerido" }, { status: 400 });
  }

  const tender = await prisma.tender.findUnique({ where: { id: params.id }, select: { title: true } });

  // Obtener el PDF
  const pdf = await getPdfBuffer(params.id, doc);
  if ('error' in pdf) return NextResponse.json({ error: pdf.error }, { status: pdf.status });

  // Límite de tamaño razonable para el envío al modelo (~18MB)
  if (pdf.buffer.length > 18 * 1024 * 1024) {
    return NextResponse.json({ error: 'El pliego es demasiado grande para analizarlo automáticamente (máx. ~18MB).' }, { status: 413 });
  }

  const base64String = pdf.buffer.toString('base64');
  const docLabel = doc === 'technical' ? 'Pliego de Prescripciones Técnicas' : 'Pliego de Cláusulas Administrativas';

  const prompt = `Eres un consultor experto en licitaciones públicas españolas. Analiza el ${docLabel} adjunto${tender?.title ? ` de la licitación "${tender.title}"` : ''} y elabora un resumen claro y accionable EN ESPAÑOL, en formato Markdown, con estas secciones (omite una sección solo si el documento realmente no aporta datos):

## 📋 Qué hay que presentar
Lista de TODOS los documentos, sobres y formularios exigidos para concurrir (documentación administrativa, oferta técnica, oferta económica, declaraciones responsables, etc.).

## ✅ Requisitos y criterios de solvencia
Requisitos de solvencia técnica y económica, habilitación, clasificación empresarial y condiciones para poder presentarse.

## 🏆 Criterios de adjudicación
Cómo se puntúa la oferta (criterios automáticos/fórmulas y criterios de juicio de valor) con sus pesos si aparecen.

## 📅 Plazos y fechas clave
Fecha límite de presentación, plazo de ejecución, duración del contrato y cualquier otra fecha relevante.

## 💰 Presupuesto y datos económicos
Presupuesto base de licitación, valor estimado, IVA, garantías (provisional/definitiva) y forma de pago.

## ⚠️ Puntos de atención
Riesgos, penalizaciones, condiciones especiales o requisitos fáciles de pasar por alto.

Sé conciso pero completo. Usa viñetas. Si un dato no consta en el documento, indícalo explícitamente en lugar de inventarlo.`;

  try {
    const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gemini-3.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'file', file: { filename: `${doc}.pdf`, file_data: `data:application/pdf;base64,${base64String}` } },
              { type: 'text', text: prompt },
            ],
          },
        ],
        max_tokens: 3500,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(280000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('[analyze-doc] LLM error', response.status, errText);
      return NextResponse.json({ error: `El análisis con IA falló (código ${response.status}).` }, { status: 502 });
    }

    const data = await response.json();
    const analysis = data?.choices?.[0]?.message?.content;
    if (!analysis || typeof analysis !== 'string') {
      return NextResponse.json({ error: 'La IA no devolvió ningún análisis.' }, { status: 502 });
    }

    return NextResponse.json({ analysis, docLabel });
  } catch (e: any) {
    console.error('[analyze-doc] exception', e?.message);
    const msg = e?.name === 'TimeoutError' || e?.name === 'AbortError'
      ? 'El análisis tardó demasiado. Inténtalo de nuevo (los pliegos muy largos pueden no completarse).'
      : 'Error al analizar el documento con IA.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
