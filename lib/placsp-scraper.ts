/**
 * Enhanced PLACSP detail page scraper
 * Extracts ALL documents (pliegos, memorias, informes, adjudicaciones, etc.)
 * from the PLACSP tender detail pages.
 */

export interface ScrapedDocument {
  name: string;
  url: string;
  category: 'pliego_tecnico' | 'pliego_admin' | 'adjudicacion' | 'formalizacion' | 'memoria' | 'informe' | 'especificaciones' | 'resolucion' | 'acta' | 'otro';
  date?: string;
}

export interface ScrapedPliegos {
  technicalDocUrl: string | null;
  adminDocUrl: string | null;
  additionalDocs: ScrapedDocument[];
  allDocuments: ScrapedDocument[];
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#243;/g, 'ó')
    .replace(/&#233;/g, 'é')
    .replace(/&#225;/g, 'á')
    .replace(/&#237;/g, 'í')
    .replace(/&#250;/g, 'ú')
    .replace(/&#241;/g, 'ñ')
    .replace(/&#191;/g, '¿')
    .replace(/&#193;/g, 'Á')
    .replace(/&#201;/g, 'É')
    .replace(/&#205;/g, 'Í')
    .replace(/&#211;/g, 'Ó')
    .replace(/&#218;/g, 'Ú')
    .replace(/&#209;/g, 'Ñ')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ' '; }
    })
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCodePoint(parseInt(n, 10)); } catch { return ' '; }
    });
}

function stripTags(s: string): string {
  // Remove tags, decode entities, then strip any leftover control-char residue
  // (e.g. \r \n \t from decoded &#xD;) and collapse whitespace.
  return decodeHtml(s.replace(/<[^>]*>/g, ' '))
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Classify a document label into a category */
function classifyDoc(label: string): ScrapedDocument['category'] {
  const l = label.toLowerCase();
  if (/pliego.{0,30}(?:prescripciones?\s+)?t[eé]cnic/.test(l) || /prescripciones?\s+t[eé]cnic/.test(l)) return 'pliego_tecnico';
  if (/pliego.{0,30}(?:cl[aá]usul|administr)/.test(l) || /cl[aá]usulas?\s+administr/.test(l)) return 'pliego_admin';
  if (/adjudicaci[oó]n/.test(l)) return 'adjudicacion';
  if (/formalizaci[oó]n/.test(l)) return 'formalizacion';
  if (/memoria/.test(l)) return 'memoria';
  if (/informe/.test(l)) return 'informe';
  if (/especificaci[oó]n|especificaciones/.test(l)) return 'especificaciones';
  if (/resoluci[oó]n/.test(l)) return 'resolucion';
  if (/acta/.test(l)) return 'acta';
  if (/pliego/.test(l)) return 'pliego_tecnico'; // generic pliego → treat as technical
  return 'otro';
}

/** Human-readable category labels */
export const DOC_CATEGORY_LABELS: Record<string, string> = {
  pliego_tecnico: 'Pliego Técnico',
  pliego_admin: 'Pliego Administrativo',
  adjudicacion: 'Adjudicación',
  formalizacion: 'Formalización',
  memoria: 'Memoria',
  informe: 'Informe',
  especificaciones: 'Especificaciones Técnicas',
  resolucion: 'Resolución',
  acta: 'Acta',
  otro: 'Documento',
};

/**
 * Fetches a PLACSP detail page and extracts ALL document URLs.
 */
export async function scrapePlacspDetail(url: string): Promise<ScrapedPliegos> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-ES,es;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!r.ok) throw new Error(`PLACSP detail HTTP ${r.status}`);
    const html = await r.text();

    let technicalDocUrl: string | null = null;
    let adminDocUrl: string | null = null;
    const allDocuments: ScrapedDocument[] = [];
    const seen = new Set<string>();

    // Find every <a href="...GetDocumentByIdServlet..."> link
    const re = /href="([^"]*GetDocumentByIdServlet[^"]*)"/gi;
    let m;

    while ((m = re.exec(html)) !== null) {
      const href = decodeHtml(m[1]);
      if (seen.has(href)) continue;
      seen.add(href);

      // Look back up to 600 chars to find the label and date
      const start = Math.max(0, m.index - 600);
      const beforeHtml = html.substring(start, m.index);
      const before = stripTags(beforeHtml).toLowerCase();

      // Extract date if present (DD/MM/YYYY HH:MM:SS)
      const dateMatches = [...before.matchAll(/(\d{2}\/\d{2}\/\d{4})\s+\d{2}:\d{2}(?::\d{2})?/g)];
      const lastDate = dateMatches.length > 0 ? dateMatches[dateMatches.length - 1][1] : undefined;

      // Get label from after the last date, or the last 120 chars
      const dateSplit = before.split(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}(?::\d{2})?/);
      let label = (dateSplit[dateSplit.length - 1] || before).trim();
      
      // Clean up common noise
      label = label.replace(/^\s*(?:este documento se abrir[aá] en una nueva ventana)?\s*/i, '').trim();
      label = label.replace(/^\s*<[^>]*>\s*/g, '').trim();
      
      // If label is too short, try a bigger context
      if (label.length < 3) {
        label = before.substring(Math.max(0, before.length - 120)).trim();
      }

      // Capitalize first letter
      if (label.length > 0) {
        label = label.charAt(0).toUpperCase() + label.slice(1);
      }
      if (label.length > 120) label = label.substring(0, 120);
      if (label.length < 3) label = 'Documento';

      const category = classifyDoc(label);

      // Set primary pliego URLs
      if (category === 'pliego_tecnico' && !technicalDocUrl) {
        technicalDocUrl = href;
      } else if (category === 'pliego_admin' && !adminDocUrl) {
        adminDocUrl = href;
      }

      allDocuments.push({
        name: label,
        url: href,
        category,
        date: lastDate,
      });
    }

    // Additional docs = everything that's not the primary tech/admin pliego
    const additionalDocs = allDocuments.filter(d => 
      d.url !== technicalDocUrl && d.url !== adminDocUrl
    );

    return { technicalDocUrl, adminDocUrl, additionalDocs, allDocuments };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Batch-scrape multiple tenders' PLACSP pages.
 * Returns count of enriched tenders.
 * Throttled to avoid overwhelming PLACSP servers.
 */
export async function batchScrapePlacsp(
  tenders: { id: string; sourceUrl: string | null }[],
  onProgress?: (done: number, total: number) => void
): Promise<{ enriched: number; errors: number; details: { id: string; docsFound: number }[] }> {
  let enriched = 0;
  let errors = 0;
  const details: { id: string; docsFound: number }[] = [];

  for (let i = 0; i < tenders.length; i++) {
    const t = tenders[i];
    if (!t.sourceUrl?.includes('contrataciondelestado.es')) {
      continue;
    }

    try {
      const scraped = await scrapePlacspDetail(t.sourceUrl);
      const totalDocs = scraped.allDocuments.length;
      
      if (totalDocs > 0) {
        enriched++;
        details.push({ id: t.id, docsFound: totalDocs });
      }

      onProgress?.(i + 1, tenders.length);

      // Throttle: 500ms between requests to be respectful to PLACSP
      await new Promise(r => setTimeout(r, 500));
    } catch (e: any) {
      errors++;
      console.warn(`[batch-scrape] Error scraping ${t.id}:`, e?.message);
      // Longer delay on error to back off
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return { enriched, errors, details };
}
