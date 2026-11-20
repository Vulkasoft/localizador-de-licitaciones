export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { buildKey, uploadBuffer, getSignedDownloadUrl, objectExists } from '@/lib/s3';
import { scrapePlacspDetail } from '@/lib/placsp-scraper';

/**
 * Document download proxy with lazy S3 cache + on-demand PLACSP detail scraping.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const tenderId = req.nextUrl.searchParams.get('tenderId');
  const doc = req.nextUrl.searchParams.get('doc'); // 'technical' | 'admin'
  const directUrl = req.nextUrl.searchParams.get('url');

  if (directUrl && !tenderId) return streamDirect(directUrl);
  if (!tenderId || !doc || !['technical', 'admin'].includes(doc)) {
    return NextResponse.json({ error: 'tenderId y doc (technical|admin) requeridos' }, { status: 400 });
  }

  let tender = await prisma.tender.findUnique({ where: { id: tenderId } });
  if (!tender) return NextResponse.json({ error: 'Licitación no encontrada' }, { status: 404 });

  let cachedKey: string | null = doc === 'technical' ? tender.cachedTechnicalDocUrl : tender.cachedAdminDocUrl;
  let sourceUrl: string | null = doc === 'technical' ? tender.technicalDocUrl : tender.adminDocUrl;
  const filename = `${doc === 'technical' ? 'Pliego_Tecnico' : 'Pliego_Administrativo'}_${tenderId}.pdf`;

  // Cache hit
  if (cachedKey) {
    try {
      if (await objectExists(cachedKey)) {
        const signed = await getSignedDownloadUrl(cachedKey, filename);
        return NextResponse.redirect(signed, 302);
      }
    } catch (e) { console.warn('[proxy-doc] cache check failed', e); }
  }

  // No source URL? Try to discover it by scraping the PLACSP detail page.
  if (!sourceUrl && tender.sourceUrl?.includes('contrataciondelestado.es') && tender.sourceUrl.includes('idEvl=')) {
    try {
      console.log(`[proxy-doc] Scraping PLACSP detail page for ${tenderId}`);
      const scraped = await scrapePlacspDetail(tender.sourceUrl);
      const updates: any = {};
      if (scraped.technicalDocUrl && !tender.technicalDocUrl) updates.technicalDocUrl = scraped.technicalDocUrl;
      if (scraped.adminDocUrl && !tender.adminDocUrl) updates.adminDocUrl = scraped.adminDocUrl;
      if (scraped.allDocuments.length > 0) {
        updates.documentsJson = JSON.stringify(scraped.allDocuments);
      }
      if (Object.keys(updates).length > 0) {
        tender = await prisma.tender.update({ where: { id: tenderId }, data: updates });
        sourceUrl = doc === 'technical' ? tender.technicalDocUrl : tender.adminDocUrl;
      }
    } catch (e: any) {
      console.warn('[proxy-doc] PLACSP scrape failed', e?.message);
    }
  }

  if (!sourceUrl) {
    return NextResponse.json({ error: 'Documento no disponible para esta licitación' }, { status: 404 });
  }

  // Fetch PDF with retries
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

  if (!buffer) {
    return NextResponse.json({ error: 'No se pudo obtener el documento del servidor oficial.', sourceUrl, detail: lastErr }, { status: 502 });
  }

  const isPdf = buffer.length > 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  if (!isPdf) {
    return NextResponse.json({ error: 'El servidor oficial devolvió contenido no-PDF', sourceUrl }, { status: 502 });
  }

  const key = buildKey(`pliegos/${tenderId}/${doc}.pdf`);
  try {
    await uploadBuffer(key, buffer, 'application/pdf', filename);
    await prisma.tender.update({
      where: { id: tenderId },
      data: doc === 'technical' ? { cachedTechnicalDocUrl: key } : { cachedAdminDocUrl: key },
    });
  } catch (e) {
    console.error('[proxy-doc] upload failed', e);
    return new NextResponse(buffer, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Content-Length': String(buffer.length) },
    });
  }

  const signed = await getSignedDownloadUrl(key, filename);
  return NextResponse.redirect(signed, 302);
}

async function streamDirect(url: string): Promise<NextResponse> {
  if (!url.includes('contrataciondelestado.es/') && !url.includes('contrataciondelsectorpublico.gob.es/')) {
    return NextResponse.json({ error: 'Dominio no permitido' }, { status: 403 });
  }
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/pdf,*/*' },
      signal: AbortSignal.timeout(45000), redirect: 'follow',
    });
    if (!r.ok) return NextResponse.json({ error: `HTTP ${r.status}` }, { status: 502 });
    const buf = Buffer.from(await r.arrayBuffer());
    return new NextResponse(buf, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="documento.pdf"', 'Content-Length': String(buf.length) },
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'No se pudo descargar', detail: e?.message }, { status: 502 });
  }
}
