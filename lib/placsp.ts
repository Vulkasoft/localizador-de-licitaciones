/**
 * PLACSP (Plataforma de Contratación del Sector Público) ATOM Feed Parser
 * 
 * Downloads and parses the official ATOM XML feeds from the Spanish government
 * to extract real tender data including document download URLs (pliegos).
 * 
 * Data source: https://www.hacienda.gob.es/es-ES/GobiernoAbierto/Datos%20Abiertos/Paginas/LicitacionesContratante.aspx
 * Format spec: CODICE 2.07
 * 
 * XML paths for documents:
 *   - Admin pliego (Cláusulas Administrativas): cac:LegalDocumentReference/cac:Attachment/cac:ExternalReference/cbc:URI
 *   - Tech pliego (Prescripciones Técnicas): cac:TechnicalDocumentReference/cac:Attachment/cac:ExternalReference/cbc:URI  
 *   - Additional docs: cac:AdditionalDocumentReference/cac:Attachment/cac:ExternalReference/cbc:URI
 */

import * as zlib from 'zlib';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as https from 'https';

// Mutable cookie jar so we can echo back the F5/BigIP "TS..." challenge cookie
// that contrataciondelsectorpublico.gob.es sets. When the site is under bot
// protection it first answers with a Set-Cookie + HTML challenge page; sending
// the captured cookie on a retry lets us fetch the real ZIP.
type CookieJar = { cookie?: string };

function downloadToFile(url: string, dest: string, timeoutMs: number, jar?: CookieJar): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    let timer: NodeJS.Timeout | null = null;
    const cleanup = (err?: Error) => {
      if (timer) clearTimeout(timer);
      file.close();
      if (err) { try { fs.unlinkSync(dest); } catch {} reject(err); }
      else resolve();
    };
    const captureCookie = (res: any) => {
      if (!jar) return;
      const sc = res.headers['set-cookie'];
      if (Array.isArray(sc) && sc.length) {
        // Keep only the name=value part of each cookie.
        const pairs = sc.map((c: string) => c.split(';')[0]).filter(Boolean);
        if (pairs.length) jar.cookie = pairs.join('; ');
      }
    };
    const doGet = (u: string, redirects = 0) => {
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (compatible; LocLicitaciones/1.0)',
        'Referer': 'https://www.hacienda.gob.es/',
        'Accept': '*/*',
      };
      if (jar?.cookie) headers['Cookie'] = jar.cookie;
      const req = https.get(u, { headers }, (res) => {
        captureCookie(res);
        if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) && res.headers.location && redirects < 5) {
          res.resume();
          return doGet(new URL(res.headers.location, u).toString(), redirects + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return cleanup(new Error(`HTTP ${res.statusCode}`));
        }
        res.pipe(file);
        file.on('finish', () => cleanup());
        res.on('error', cleanup);
      });
      req.on('error', cleanup);
      timer = setTimeout(() => { req.destroy(new Error('Timeout')); }, timeoutMs);
    };
    doGet(url);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// CPV codes are matched literally (always reliable)
const DRONE_CPV = ['34711200', '35613000', '34711100', '34711400'];

// Keywords that must match as whole words to avoid false positives (e.g. "uas" in "cláusulas")
const DRONE_WORD_PATTERNS = [
  /\bdron\w*/i,                       // dron, drones, drone
  /\brpas\b/i,
  /\buas\b/i,                         // standalone UAS only (not "cláusulas")
  /\buav\b/i,
  /\baeronave[s]?\s+no\s+tripulad/i,
  /\bveh[ií]culo[s]?\s+a[eé]reo[s]?\s+no\s+tripulad/i,
  /\bsistema[s]?\s+a[eé]reo[s]?\s+no\s+tripulad/i,
  /\bplataforma[s]?\s+no\s+tripulad/i,
  /\bpiloto[s]?\s+remoto/i,
  /\bpiloto[s]?\s+de\s+dron/i,
  /\bformaci[oó]n\s+(de\s+)?pilot/i,  // formación de pilotos / formación piloto
  /\bcurso[s]?\s+(de\s+)?pilot.*dron/i, // cursos piloto drones
  /\bhabilitaci[oó]n\s+(de\s+)?pilot/i,
  /\boperador[es]?\s+de\s+dron/i,
  /\bmatrice\b/i,
  /\bmavic\b/i,
  /\bphantom\s*\d/i,
  /\bdji\b/i,
  /\bdji\s+inspire/i,                 // DJI Inspire (not "gabriel inspire" felpudos)
  /\bazimut[h]?\s*(300|350)/i,        // DJI enterprise models
  /\bflir\b/i,                        // Thermal cameras often bundled with drones
  /\bzenmuse\b/i,                     // DJI Zenmuse cameras
  /\bvu[e]?lo[s]?\s+(con\s+)?dron/i,  // vuelos con dron
  /\bvu[e]?lo[s]?\s+(de\s+)?dron/i,   // vuelo de dron
  /\bvu[e]?lo[s]?\s+fotogr[aá]f/i,   // vuelo fotográfico (usually with drones)
  /\btopograf[ií]a\s+(con\s+)?dron/i, // topografía con dron (not just any topography)
  /\bcartograf[ií]a\s+(con\s+)?dron/i,// cartografía con dron
  /\bortofoto\w*\s+(con\s+)?dron/i,   // ortofotografía con dron
];

// Broader terms that only count with additional drone context
const DRONE_BROAD_TERMS = [
  'lidar', 'fotogramet', 'cámara térmica', 'camara termica',
  'termograf', 'sensor térmico', 'sensor termico',
  'teledetección', 'teledeteccion', 'sensorizaci',
  'vigilancia aérea', 'vigilancia aerea',
  'inspección aérea', 'inspeccion aerea',
  'monitorización aérea', 'monitorizacion aerea',
];

// Spanish regions mapping — CCAA keywords (broad terms first)
const CCAA_KEYWORDS: Record<string, string> = {
  'andaluc': 'Andalucía', 'junta de andaluc': 'Andalucía',
  'aragón': 'Aragón', 'aragon': 'Aragón', 'gobierno de aragón': 'Aragón',
  'asturias': 'Asturias', 'principado de asturias': 'Asturias',
  'balears': 'Islas Baleares', 'baleares': 'Islas Baleares', 'illes balears': 'Islas Baleares',
  'canarias': 'Canarias', 'gobierno de canarias': 'Canarias', 'cabildo': 'Canarias',
  'cantabria': 'Cantabria', 'gobierno de cantabria': 'Cantabria',
  'castilla y león': 'Castilla y León', 'junta de castilla y león': 'Castilla y León',
  'castilla-la mancha': 'Castilla-La Mancha', 'junta de comunidades de castilla': 'Castilla-La Mancha',
  'cataluña': 'Cataluña', 'catalunya': 'Cataluña', 'generalitat de catalunya': 'Cataluña',
  'extremadura': 'Extremadura', 'junta de extremadura': 'Extremadura',
  'galicia': 'Galicia', 'xunta de galicia': 'Galicia',
  'la rioja': 'La Rioja', 'gobierno de la rioja': 'La Rioja',
  'comunidad de madrid': 'Comunidad de Madrid',
  'región de murcia': 'Región de Murcia', 'region de murcia': 'Región de Murcia',
  'navarra': 'Navarra', 'gobierno de navarra': 'Navarra', 'gobierno foral': 'Navarra',
  'país vasco': 'País Vasco', 'euskadi': 'País Vasco', 'gobierno vasco': 'País Vasco',
  'comunidad valenciana': 'Comunidad Valenciana', 'generalitat valenciana': 'Comunidad Valenciana',
  'ceuta': 'Ceuta', 'melilla': 'Melilla',
};

// City/municipality → CCAA mapping (for detecting region from contracting body or title text)
const CITY_TO_CCAA: Record<string, string> = {
  // === CANARIAS — Las Palmas ===
  'puerto del rosario': 'Canarias', 'fuerteventura': 'Canarias',
  'las palmas': 'Canarias', 'gran canaria': 'Canarias',
  'lanzarote': 'Canarias', 'arrecife': 'Canarias',
  'la oliva': 'Canarias', 'antigua': 'Canarias',
  'betancuria': 'Canarias', 'pájara': 'Canarias', 'pajara': 'Canarias',
  'tuineje': 'Canarias', 'corralejo': 'Canarias',
  'telde': 'Canarias', 'arucas': 'Canarias',
  'gáldar': 'Canarias', 'galdar': 'Canarias',
  'mogán': 'Canarias', 'mogan': 'Canarias',
  'san bartolomé de tirajana': 'Canarias', 'maspalomas': 'Canarias',
  'playa del inglés': 'Canarias', 'playa del ingles': 'Canarias',
  'santa lucía de tirajana': 'Canarias', 'vecindario': 'Canarias',
  'ingenio': 'Canarias', 'agüimes': 'Canarias', 'aguimes': 'Canarias',
  'tejeda': 'Canarias', 'valleseco': 'Canarias',
  'teror': 'Canarias', 'firgas': 'Canarias', 'moya': 'Canarias',
  'agaete': 'Canarias', 'guía de isora': 'Canarias',
  'puerto del carmen': 'Canarias', 'yaiza': 'Canarias',
  'tías': 'Canarias', 'tias': 'Canarias',
  'san bartolomé': 'Canarias', 'haría': 'Canarias', 'haria': 'Canarias',
  'teguise': 'Canarias', 'tinajo': 'Canarias',
  // === CANARIAS — Santa Cruz de Tenerife ===
  'santa cruz de tenerife': 'Canarias', 'tenerife': 'Canarias',
  'la laguna': 'Canarias', 'san cristóbal de la laguna': 'Canarias',
  'arona': 'Canarias', 'adeje': 'Canarias',
  'los cristianos': 'Canarias', 'costa adeje': 'Canarias',
  'la orotava': 'Canarias', 'puerto de la cruz': 'Canarias',
  'los realejos': 'Canarias', 'icod de los vinos': 'Canarias',
  'güímar': 'Canarias', 'guimar': 'Canarias',
  'candelaria': 'Canarias', 'granadilla': 'Canarias',
  'tacoronte': 'Canarias', 'el rosario': 'Canarias',
  'san miguel de abona': 'Canarias', 'santiago del teide': 'Canarias',
  'los llanos de aridane': 'Canarias', 'santa cruz de la palma': 'Canarias',
  'la palma': 'Canarias', 'la gomera': 'Canarias',
  'san sebastián de la gomera': 'Canarias', 'el hierro': 'Canarias',
  'valverde': 'Canarias',
  'la graciosa': 'Canarias', 'caleta de sebo': 'Canarias',
  // === ANDALUCÍA ===
  'sevilla': 'Andalucía', 'málaga': 'Andalucía', 'malaga': 'Andalucía',
  'córdoba': 'Andalucía', 'cordoba': 'Andalucía',
  'granada': 'Andalucía', 'almería': 'Andalucía', 'almeria': 'Andalucía',
  'cádiz': 'Andalucía', 'cadiz': 'Andalucía',
  'huelva': 'Andalucía', 'jaén': 'Andalucía', 'jaen': 'Andalucía',
  'jerez': 'Andalucía', 'marbella': 'Andalucía', 'algeciras': 'Andalucía',
  'dos hermanas': 'Andalucía', 'torremolinos': 'Andalucía',
  'rota': 'Andalucía', 'sanlúcar': 'Andalucía', 'sanlucar': 'Andalucía',
  'chiclana': 'Andalucía', 'el puerto de santa maría': 'Andalucía',
  'linares': 'Andalucía', 'motril': 'Andalucía', 'mairena': 'Andalucía',
  'roquetas de mar': 'Andalucía', 'estepona': 'Andalucía',
  'alcalá de guadaíra': 'Andalucía', 'utrera': 'Andalucía',
  'medina-sidonia': 'Andalucía', 'vejer de la frontera': 'Andalucía',
  'ojén': 'Andalucía', 'ojen': 'Andalucía',
  // === COMUNIDAD DE MADRID ===
  'madrid': 'Comunidad de Madrid', 'alcobendas': 'Comunidad de Madrid',
  'san sebastián de los reyes': 'Comunidad de Madrid',
  'pinto': 'Comunidad de Madrid', 'getafe': 'Comunidad de Madrid',
  'leganés': 'Comunidad de Madrid', 'leganes': 'Comunidad de Madrid',
  'alcorcón': 'Comunidad de Madrid', 'alcorcon': 'Comunidad de Madrid',
  'fuenlabrada': 'Comunidad de Madrid', 'móstoles': 'Comunidad de Madrid', 'mostoles': 'Comunidad de Madrid',
  'parla': 'Comunidad de Madrid', 'torrejón de ardoz': 'Comunidad de Madrid',
  'alcalá de henares': 'Comunidad de Madrid', 'coslada': 'Comunidad de Madrid',
  'pozuelo de alarcón': 'Comunidad de Madrid', 'las rozas': 'Comunidad de Madrid',
  'rivas-vaciamadrid': 'Comunidad de Madrid', 'rivas vaciamadrid': 'Comunidad de Madrid',
  'majadahonda': 'Comunidad de Madrid', 'tres cantos': 'Comunidad de Madrid',
  'valdemoro': 'Comunidad de Madrid', 'collado villalba': 'Comunidad de Madrid',
  'aranjuez': 'Comunidad de Madrid', 'arganda del rey': 'Comunidad de Madrid',
  'ciempozuelos': 'Comunidad de Madrid', 'las matas': 'Comunidad de Madrid',
  // === COMUNIDAD VALENCIANA ===
  'valencia': 'Comunidad Valenciana', 'alicante': 'Comunidad Valenciana',
  'castellón': 'Comunidad Valenciana', 'castellon': 'Comunidad Valenciana',
  'elche': 'Comunidad Valenciana', 'torrevieja': 'Comunidad Valenciana',
  'orihuela': 'Comunidad Valenciana', 'benidorm': 'Comunidad Valenciana',
  'sagunto': 'Comunidad Valenciana', 'gandía': 'Comunidad Valenciana', 'gandia': 'Comunidad Valenciana',
  'alcoy': 'Comunidad Valenciana', 'elda': 'Comunidad Valenciana',
  'canet d\'en berenguer': 'Comunidad Valenciana', 'vinaròs': 'Comunidad Valenciana', 'vinaros': 'Comunidad Valenciana',
  'tarongers': 'Comunidad Valenciana',
  // === ILLES BALEARS ===
  'palma de mallorca': 'Islas Baleares', 'palma': 'Islas Baleares',
  'mallorca': 'Islas Baleares', 'ibiza': 'Islas Baleares', 'eivissa': 'Islas Baleares',
  'menorca': 'Islas Baleares', 'formentera': 'Islas Baleares',
  'calvià': 'Islas Baleares', 'calviá': 'Islas Baleares', 'calvia': 'Islas Baleares',
  'manacor': 'Islas Baleares', 'inca': 'Islas Baleares',
  'sant josep de sa talaia': 'Islas Baleares',
  'santa eulària': 'Islas Baleares', 'santa eularia': 'Islas Baleares',
  'sant antoni': 'Islas Baleares',
  // === CATALUÑA ===
  'barcelona': 'Cataluña', 'girona': 'Cataluña', 'gerona': 'Cataluña',
  'lleida': 'Cataluña', 'lérida': 'Cataluña', 'lerida': 'Cataluña',
  'tarragona': 'Cataluña', 'sabadell': 'Cataluña', 'terrassa': 'Cataluña',
  'badalona': 'Cataluña', 'hospitalet': 'Cataluña',
  'mataró': 'Cataluña', 'mataro': 'Cataluña',
  'reus': 'Cataluña', 'manresa': 'Cataluña',
  // === ARAGÓN ===
  'zaragoza': 'Aragón', 'huesca': 'Aragón', 'teruel': 'Aragón',
  'sabiñánigo': 'Aragón', 'sabinanigo': 'Aragón',
  'jaca': 'Aragón', 'calatayud': 'Aragón',
  'mallén': 'Aragón', 'mallen': 'Aragón',
  // === CASTILLA Y LEÓN ===
  'burgos': 'Castilla y León', 'valladolid': 'Castilla y León',
  'león': 'Castilla y León', 'salamanca': 'Castilla y León',
  'segovia': 'Castilla y León', 'ávila': 'Castilla y León', 'avila': 'Castilla y León',
  'soria': 'Castilla y León', 'palencia': 'Castilla y León',
  'zamora': 'Castilla y León', 'ponferrada': 'Castilla y León',
  'cuéllar': 'Castilla y León', 'cuellar': 'Castilla y León',
  'villoldo': 'Castilla y León', 'valdepiélago': 'Castilla y León',
  // === CASTILLA-LA MANCHA ===
  'toledo': 'Castilla-La Mancha', 'ciudad real': 'Castilla-La Mancha',
  'albacete': 'Castilla-La Mancha', 'cuenca': 'Castilla-La Mancha',
  'guadalajara': 'Castilla-La Mancha', 'talavera de la reina': 'Castilla-La Mancha',
  'salvacañete': 'Castilla-La Mancha',
  // === GALICIA ===
  'a coruña': 'Galicia', 'la coruña': 'Galicia', 'vigo': 'Galicia',
  'ourense': 'Galicia', 'pontevedra': 'Galicia', 'lugo': 'Galicia',
  'santiago de compostela': 'Galicia', 'ferrol': 'Galicia',
  'arteixo': 'Galicia', 'bergondo': 'Galicia',
  // === ASTURIAS ===
  'oviedo': 'Asturias', 'gijón': 'Asturias', 'gijon': 'Asturias',
  'avilés': 'Asturias', 'aviles': 'Asturias',
  'mieres': 'Asturias', 'luanco': 'Asturias',
  // === PAÍS VASCO ===
  'bilbao': 'País Vasco', 'donostia': 'País Vasco', 'san sebastián': 'País Vasco',
  'vitoria': 'País Vasco', 'vitoria-gasteiz': 'País Vasco',
  'barakaldo': 'País Vasco', 'getxo': 'País Vasco',
  // === CANTABRIA ===
  'santander': 'Cantabria', 'torrelavega': 'Cantabria',
  // === EXTREMADURA ===
  'badajoz': 'Extremadura', 'cáceres': 'Extremadura', 'caceres': 'Extremadura',
  'mérida': 'Extremadura', 'merida': 'Extremadura',
  'villar de rena': 'Extremadura', 'guadiana': 'Extremadura',
  // === REGIÓN DE MURCIA ===
  'murcia': 'Región de Murcia', 'cartagena': 'Región de Murcia',
  'lorca': 'Región de Murcia', 'moratalla': 'Región de Murcia',
  // === LA RIOJA ===
  'logroño': 'La Rioja', 'logrono': 'La Rioja',
  // === NAVARRA ===
  'pamplona': 'Navarra', 'iruña': 'Navarra', 'tudela': 'Navarra',
};

export interface PLACSPTender {
  sourceId: string;
  title: string;
  summary: string;
  description?: string;
  link: string;
  contractingBody: string;
  budgetAmount: number | null;
  cpvCodes: string | null;
  status: string;
  publicationDate: string | null;
  deadline: string | null;
  regionCcaa: string | null;
  province: string | null;
  technicalDocUrl: string | null;
  adminDocUrl: string | null;
  additionalDocs: string[];
  expediente: string | null;
  isMinorContract?: boolean;
  tenderPhase?: string; // pre_licitacion | licitacion | adjudicada | formalizada | resuelta
  awardedTo?: string | null;
  awardedAmount?: number | null;
  awardedDate?: string | null;
}

/**
 * Map PLACSP ContractFolderStatusCode to tender phase
 * PRE = anuncio previo / consulta preliminar
 * PUB = publicada (en licitación)
 * EV = evaluación
 * ADJ = adjudicada
 * RES = resuelta / formalizada
 */
function mapPhase(statusCode: string | null): string {
  if (!statusCode) return 'licitacion';
  const s = statusCode.toUpperCase();
  if (s === 'PRE' || s === 'ANUN') return 'pre_licitacion';
  if (s === 'ADJ') return 'adjudicada';
  if (s === 'RES' || s === 'FORM') return 'formalizada';
  return 'licitacion';
}

export function decodeXmlEntities(str: string): string {
  return str
    // Numeric entities (hex &#xD; and decimal &#13;) — e.g. &#xD; = carriage return
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => {
      try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ' '; }
    })
    .replace(/&#(\d+);/g, (_m, d) => {
      try { return String.fromCodePoint(parseInt(d, 10)); } catch { return ' '; }
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Cleans a text field for storage/display: decodes HTML/XML entities and
 * normalizes whitespace (control chars → space, collapse runs, trim).
 * Guarantees no leftover code residue (e.g. "&#xD;", stray \r\n\t) ends up in
 * titles, descriptions or contracting-body names.
 */
export function cleanText(str: string | null | undefined): string {
  if (!str) return '';
  return decodeXmlEntities(str)
    .replace(/[\u0000-\u001F\u007F]+/g, ' ') // control chars (incl. \r \n \t) → space
    .replace(/\s{2,}/g, ' ')                   // collapse multiple spaces
    .trim();
}

function extractTag(xml: string, tag: string): string | null {
  // Match both namespaced and simple tags
  const patterns = [
    new RegExp(`<${tag}[^>]*>\\s*([\\s\\S]*?)\\s*</${tag}>`, 'i'),
    new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, 'i'),
  ];
  for (const p of patterns) {
    const m = xml.match(p);
    if (m) return decodeXmlEntities(m[1].trim());
  }
  return null;
}

function extractAttr(xml: string, tag: string, attr: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`));
  return m ? decodeXmlEntities(m[1]) : null;
}

function extractDocUri(xml: string, docTag: string): string | null {
  const docPattern = new RegExp(
    `<cac:${docTag}>[\\s\\S]*?<cbc:URI>\\s*([\\s\\S]*?)\\s*</cbc:URI>[\\s\\S]*?</cac:${docTag}>`,
    'i'
  );
  const m = xml.match(docPattern);
  return m ? decodeXmlEntities(m[1].trim()) : null;
}

function extractAllDocUris(xml: string, docTag: string): string[] {
  const results: string[] = [];
  const regex = new RegExp(
    `<cac:${docTag}>[\\s\\S]*?<cbc:URI>\\s*([\\s\\S]*?)\\s*</cbc:URI>[\\s\\S]*?</cac:${docTag}>`,
    'gi'
  );
  let m;
  while ((m = regex.exec(xml)) !== null) {
    results.push(decodeXmlEntities(m[1].trim()));
  }
  return results;
}

// Province code to CCAA mapping (Spanish INE province codes)
const PROVINCE_TO_CCAA: Record<string, string> = {
  '01': 'País Vasco', '02': 'Castilla-La Mancha', '03': 'Comunidad Valenciana', '04': 'Andalucía',
  '05': 'Castilla y León', '06': 'Extremadura', '07': 'Islas Baleares', '08': 'Cataluña',
  '09': 'Castilla y León', '10': 'Extremadura', '11': 'Andalucía', '12': 'Comunidad Valenciana',
  '13': 'Castilla-La Mancha', '14': 'Andalucía', '15': 'Galicia', '16': 'Castilla-La Mancha',
  '17': 'Cataluña', '18': 'Andalucía', '19': 'Castilla-La Mancha', '20': 'País Vasco',
  '21': 'Andalucía', '22': 'Aragón', '23': 'Andalucía', '24': 'Castilla y León',
  '25': 'Cataluña', '26': 'La Rioja', '27': 'Galicia', '28': 'Comunidad de Madrid',
  '29': 'Andalucía', '30': 'Región de Murcia', '31': 'Navarra', '32': 'Galicia',
  '33': 'Asturias', '34': 'Castilla y León', '35': 'Canarias', '36': 'Galicia',
  '37': 'Castilla y León', '38': 'Canarias', '39': 'Cantabria', '40': 'Castilla y León',
  '41': 'Andalucía', '42': 'Castilla y León', '43': 'Cataluña', '44': 'Aragón',
  '45': 'Castilla-La Mancha', '46': 'Comunidad Valenciana', '47': 'Castilla y León',
  '48': 'País Vasco', '49': 'Castilla y León', '50': 'Aragón', '51': 'Ceuta', '52': 'Melilla',
};

function detectRegion(text: string, entryXml?: string): string | null {
  // 1. Try province code first (most accurate — from XML CountrySubentityCode)
  if (entryXml) {
    const codeMatch = entryXml.match(/<cbc:CountrySubentityCode>(\d{2})/i);
    if (codeMatch && PROVINCE_TO_CCAA[codeMatch[1]]) {
      return PROVINCE_TO_CCAA[codeMatch[1]];
    }
    // Also try NUTS code (ES7 = Canarias, ES61 = Andalucía, etc.)
    const nutsMatch = entryXml.match(/<cbc:CountrySubentity>\s*ES(\d{1,2})/i);
    if (nutsMatch) {
      const nutsPrefix = nutsMatch[1];
      const nutsMap: Record<string, string> = {
        '11': 'Galicia', '12': 'Asturias', '13': 'Cantabria', '21': 'País Vasco',
        '22': 'Navarra', '23': 'La Rioja', '24': 'Aragón', '3': 'Comunidad de Madrid', '30': 'Comunidad de Madrid',
        '41': 'Castilla y León', '42': 'Castilla-La Mancha', '43': 'Extremadura',
        '51': 'Cataluña', '52': 'Comunidad Valenciana', '53': 'Islas Baleares',
        '61': 'Andalucía', '62': 'Región de Murcia', '63': 'Ceuta', '64': 'Melilla',
        '7': 'Canarias', '70': 'Canarias',
      };
      if (nutsMap[nutsPrefix]) return nutsMap[nutsPrefix];
    }
  }

  const lower = text.toLowerCase();

  // 2. Try specific city/municipality names (longer keys first for precision)
  const cityKeys = Object.keys(CITY_TO_CCAA).sort((a, b) => b.length - a.length);
  for (const city of cityKeys) {
    if (lower.includes(city)) return CITY_TO_CCAA[city];
  }

  // 3. Try CCAA keyword matching
  const ccaaKeys = Object.keys(CCAA_KEYWORDS).sort((a, b) => b.length - a.length);
  for (const key of ccaaKeys) {
    if (lower.includes(key)) return CCAA_KEYWORDS[key];
  }

  return null;
}

/**
 * Standalone region detection for updating existing DB records
 * (used without XML context — just from contracting body + title text)
 */
export function detectRegionFromText(text: string): string | null {
  return detectRegion(text);
}

function parseEntry(entryXml: string): PLACSPTender | null {
  const id = extractTag(entryXml, 'id');
  const title = extractTag(entryXml, 'title');
  const summary = extractTag(entryXml, 'summary');
  const link = extractAttr(entryXml, 'link', 'href');

  if (!title || !id) return null;

  // Extract PLACSP-specific data
  const contractingBody = extractTag(entryXml, 'cbc:Name') || '';
  
  // Budget
  const budgetStr = extractTag(entryXml, 'cbc:TotalAmount') 
    || extractTag(entryXml, 'cbc:TaxExclusiveAmount')
    || extractTag(entryXml, 'cbc:EstimatedOverallContractAmount');
  const budgetAmount = budgetStr ? parseFloat(budgetStr) : null;

  // CPV
  const cpvCodes = extractTag(entryXml, 'cbc:ItemClassificationCode');
  
  // Status & phase
  const statusCode = extractTag(entryXml, 'cbc-place-ext:ContractFolderStatusCode');
  const status = statusCode === 'PUB' || statusCode === 'EV' ? 'active' : statusCode || 'active';
  const tenderPhase = mapPhase(statusCode);

  // Awardee extraction (when phase is adjudicada/formalizada)
  let awardedTo: string | null = null;
  let awardedAmount: number | null = null;
  let awardedDate: string | null = null;
  if (tenderPhase === 'adjudicada' || tenderPhase === 'formalizada') {
    // Try multiple common patterns. PLACSP CODICE uses cac:WinningParty or cac:AwardedTenderedProject
    const winningBlockMatch =
      entryXml.match(/<cac:WinningParty>[\s\S]*?<cbc:Name>\s*([\s\S]*?)\s*<\/cbc:Name>[\s\S]*?<\/cac:WinningParty>/i) ||
      entryXml.match(/<cac:Awar(?:d|de)dParty>[\s\S]*?<cbc:Name>\s*([\s\S]*?)\s*<\/cbc:Name>[\s\S]*?<\/cac:Awar(?:d|de)dParty>/i) ||
      entryXml.match(/<cac:Tenderer(?:Party)?>[\s\S]*?<cbc:Name>\s*([\s\S]*?)\s*<\/cbc:Name>[\s\S]*?<\/cac:Tenderer(?:Party)?>/i);
    if (winningBlockMatch) awardedTo = cleanText(winningBlockMatch[1]).slice(0, 200);

    // Awarded amount
    const awardedAmtMatch = entryXml.match(/<cbc:PayableAmount[^>]*>\s*([\d.,]+)\s*<\/cbc:PayableAmount>/i);
    if (awardedAmtMatch) {
      const v = parseFloat(awardedAmtMatch[1].replace(/,/g, '.'));
      if (!isNaN(v) && v > 0) awardedAmount = v;
    }

    // Award date
    const awardDateMatch =
      entryXml.match(/<cac:AwardedTenderedProject>[\s\S]*?<cbc:AwardDate>\s*([\d-]+)\s*<\/cbc:AwardDate>/i) ||
      entryXml.match(/<cbc:AwardDate>\s*([\d-]+)\s*<\/cbc:AwardDate>/i) ||
      entryXml.match(/<cbc:ContractFormalizationDate>\s*([\d-]+)\s*<\/cbc:ContractFormalizationDate>/i);
    if (awardDateMatch) awardedDate = awardDateMatch[1];
  }

  // Dates
  const pubDate = extractTag(entryXml, 'updated') || extractTag(entryXml, 'published');
  const deadlineDate = extractTag(entryXml, 'cbc:EndDate');

  // Region from province code or text matching
  const regionCcaa = detectRegion(contractingBody + ' ' + (summary || '') + ' ' + title, entryXml);

  // Expediente
  const expediente = extractTag(entryXml, 'cbc:ContractFolderID');

  // DOCUMENTS - the key part!
  const adminDocUrl = extractDocUri(entryXml, 'LegalDocumentReference');
  const technicalDocUrl = extractDocUri(entryXml, 'TechnicalDocumentReference');
  const additionalDocs = extractAllDocUris(entryXml, 'Adi?tionalDocumentReference');

  // Extract sourceId from the PLACSP ID URL
  const sourceIdMatch = id.match(/\/(\d+)$/);
  const sourceId = sourceIdMatch ? `PLACSP-${sourceIdMatch[1]}` : `PLACSP-${Date.now()}`;

  return {
    sourceId,
    title: cleanText(title),
    summary: cleanText(summary),
    link: link || '',
    contractingBody: cleanText(contractingBody),
    budgetAmount,
    cpvCodes,
    status,
    publicationDate: pubDate || null,
    deadline: deadlineDate || null,
    regionCcaa,
    province: null,
    technicalDocUrl,
    adminDocUrl,
    additionalDocs,
    expediente,
    tenderPhase,
    awardedTo,
    awardedAmount,
    awardedDate,
  };
}

// Obvious false positives — terms that look like drone keywords but aren't
const FALSE_POSITIVE_RE = /felpudo|moqueta|campo de vuelo[s]?\b|viaje cultural|reserva de vuelos y traslados|letreros campo|gabriel inspire/i;

function isDroneRelated(entry: PLACSPTender): boolean {
  const text = `${entry.title} ${entry.summary} ${entry.cpvCodes || ''} ${entry.contractingBody}`;
  
  // Reject known false positives first
  if (FALSE_POSITIVE_RE.test(text)) return false;
  
  const lower = text.toLowerCase();
  
  // CPV codes are definitive
  if (DRONE_CPV.some(cpv => lower.includes(cpv))) return true;
  
  // Word-boundary keyword patterns
  if (DRONE_WORD_PATTERNS.some(p => p.test(text))) return true;
  
  // Broad terms only count if there's also a drone indicator
  const hasDroneIndicator = /\bdron|\brpas\b|\buas\b|\buav\b|no tripulad/i.test(text);
  if (hasDroneIndicator && DRONE_BROAD_TERMS.some(t => lower.includes(t))) return true;
  
  return false;
}

/**
 * Downloads and parses a PLACSP ATOM ZIP file.
 * Returns drone-related tenders with real document URLs.
 */
/**
 * Process a single compressed ATOM entry from the ZIP — inflate and extract matching tenders.
 * Processes the inflated XML in 512KB chunks to avoid holding the full string in memory.
 */
function processAtomBuffer(compData: Buffer, tenders: PLACSPTender[]): number {
  let inflated: Buffer;
  try {
    inflated = zlib.inflateRawSync(compData);
  } catch { return 0; }

  let found = 0;

  // Scan buffer for <entry>...</entry> blocks without converting entire buffer to string
  const ENTRY_OPEN = Buffer.from('<entry>');
  const ENTRY_CLOSE = Buffer.from('</entry>');
  let searchStart = 0;

  while (searchStart < inflated.length) {
    const openIdx = inflated.indexOf(ENTRY_OPEN, searchStart);
    if (openIdx < 0) break;
    const closeIdx = inflated.indexOf(ENTRY_CLOSE, openIdx + ENTRY_OPEN.length);
    if (closeIdx < 0) break;

    const entryBuf = inflated.subarray(openIdx + ENTRY_OPEN.length, closeIdx);
    searchStart = closeIdx + ENTRY_CLOSE.length;

    // Quick keyword check — ONLY drone-related tenders
    const entryXml = entryBuf.toString('utf-8');
    const hasCpv = DRONE_CPV.some(cpv => entryXml.includes(cpv));
    const hasKeyword = !hasCpv && DRONE_WORD_PATTERNS.some(p => p.test(entryXml));
    if (!hasCpv && !hasKeyword) continue;

    const parsed = parseEntry(entryXml);
    if (parsed && isDroneRelated(parsed)) {
      tenders.push(parsed);
      found++;
    }
  }

  // Help GC reclaim the inflated buffer immediately
  inflated = null as any;
  return found;
}

/**
 * Downloads and parses a single PLACSP ATOM ZIP file.
 * Processes entries file-by-file, releasing memory between ATOM files.
 */
export async function fetchPLACSPTenders(yearMonth?: string, feedUrl?: string, feedLabel?: string, isMinorFeed?: boolean, phaseOverride?: string): Promise<PLACSPTender[]> {
  const now = new Date();
  const ym = yearMonth || `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const label = feedLabel || 'licitaciones';
  
  const url = feedUrl || `https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3_${ym}.zip`;
  
  console.log(`[PLACSP] Downloading ${label} feed for ${ym}...`);
  
  const tmpFile = path.join(os.tmpdir(), `placsp_${label}_${ym}_${Date.now()}.zip`);
  
  try {
    // The government server (F5/BigIP bot protection) intermittently answers with
    // an HTML challenge page (HTTP 200) instead of the ZIP. Retry a few times,
    // echoing back any challenge cookie, before giving up gracefully.
    const MAX_ATTEMPTS = 3;
    const jar: CookieJar = {};
    let zipBuf: Buffer | null = null;
    let lastSize = 0;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        try { fs.unlinkSync(tmpFile); } catch {}
        await downloadToFile(url, tmpFile, 300000, jar);
      } catch (dlErr: any) {
        if (attempt < MAX_ATTEMPTS) {
          console.log(`[PLACSP] ${label} ${ym} download attempt ${attempt} failed (${dlErr?.message}), retrying...`);
          await sleep(2000 * attempt);
          continue;
        }
        console.log(`[PLACSP] ${label} ${ym} feed not available after ${MAX_ATTEMPTS} attempts (${dlErr?.message}), skipping.`);
        return [];
      }

      if (!fs.existsSync(tmpFile)) {
        if (attempt < MAX_ATTEMPTS) { await sleep(2000 * attempt); continue; }
        console.log(`[PLACSP] ${label} ${ym} feed not available (no file downloaded), skipping.`);
        return [];
      }
      const stat = fs.statSync(tmpFile);
      lastSize = stat.size;
      const buf = fs.readFileSync(tmpFile);

      // Verify ZIP signature (local file header: 0x04034b50). A non-ZIP payload
      // (e.g. an HTML challenge/error page) means we were challenged or the feed
      // has no data — retry, then skip gracefully if it never becomes a ZIP.
      if (stat.size >= 100 && buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50) {
        zipBuf = buf;
        break;
      }

      if (attempt < MAX_ATTEMPTS) {
        console.log(`[PLACSP] ${label} ${ym} attempt ${attempt} returned no valid ZIP (${stat.size} bytes), retrying...`);
        await sleep(2000 * attempt);
        continue;
      }
    }

    if (!zipBuf) {
      console.log(`[PLACSP] ${label} ${ym} feed returned no valid ZIP after ${MAX_ATTEMPTS} attempts (last ${lastSize} bytes, likely empty/unavailable), skipping.`);
      return [];
    }

    console.log(`[PLACSP] Downloaded ${(zipBuf.length / 1024 / 1024).toFixed(1)}MB ${label}, parsing...`);
    
    const tenders: PLACSPTender[] = [];
    let offset = 0;
    let fileCount = 0;

    while (offset < zipBuf.length - 4) {
      const sig = zipBuf.readUInt32LE(offset);
      if (sig !== 0x04034b50) break;

      const method = zipBuf.readUInt16LE(offset + 8);
      let compSize = zipBuf.readUInt32LE(offset + 18);
      let uncompSize = zipBuf.readUInt32LE(offset + 22);
      const nameLen = zipBuf.readUInt16LE(offset + 26);
      const extraLen = zipBuf.readUInt16LE(offset + 28);

      const nameStart = offset + 30;
      const name = zipBuf.subarray(nameStart, nameStart + nameLen).toString('utf-8');
      const extraStart = nameStart + nameLen;
      const extra = zipBuf.subarray(extraStart, extraStart + extraLen);
      const dataStart = extraStart + extraLen;

      // Handle ZIP64 extended info
      if (compSize === 0xFFFFFFFF || uncompSize === 0xFFFFFFFF) {
        let i = 0;
        while (i < extra.length - 4) {
          const eid = extra.readUInt16LE(i);
          const esz = extra.readUInt16LE(i + 2);
          if (eid === 0x0001) {
            let off = i + 4;
            const vals: number[] = [];
            while (off < i + 4 + esz && off + 8 <= extra.length) {
              const lo = extra.readUInt32LE(off);
              const hi = extra.readUInt32LE(off + 4);
              vals.push(lo + hi * 0x100000000);
              off += 8;
            }
            let idx = 0;
            if (uncompSize === 0xFFFFFFFF && idx < vals.length) { uncompSize = vals[idx]; idx++; }
            if (compSize === 0xFFFFFFFF && idx < vals.length) { compSize = vals[idx]; }
            break;
          }
          i += 4 + esz;
        }
      }

      if (name.endsWith('.atom') && method === 8) {
        const compData = zipBuf.subarray(dataStart, dataStart + compSize);
        const found = processAtomBuffer(compData, tenders);
        fileCount++;
        if (fileCount % 10 === 0) {
          console.log(`[PLACSP] Processed ${fileCount} atom files, ${tenders.length} matches so far...`);
        }
      }

      offset = dataStart + compSize;
    }

    console.log(`[PLACSP] Parsed ${fileCount} ATOM files from ${label}, found ${tenders.length} tenders`);
    // Mark minor contracts
    if (isMinorFeed) {
      tenders.forEach(t => { t.isMinorContract = true; });
    }
    if (phaseOverride) {
      tenders.forEach(t => { t.tenderPhase = phaseOverride; });
    }
    return tenders;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
    // Force GC if available
    if (global.gc) { try { global.gc(); } catch {} }
  }
}

/**
 * Fetches recent months of PLACSP data from multiple feeds:
 *  1. Licitaciones (sindicacion_643) — main tenders
 *  2. Contratos menores (sindicacion_1143) — minor contracts  
 *  3. Plataformas agregadas (sindicacion_644) — aggregated from regional platforms/cabildos
 */
export async function fetchRecentPLACSPTenders(): Promise<PLACSPTender[]> {
  const now = new Date();
  const currentYM = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prev = new Date(now);
  prev.setMonth(prev.getMonth() - 1);
  const prevYM = `${prev.getFullYear()}${String(prev.getMonth() + 1).padStart(2, '0')}`;
  const months = [currentYM, prevYM];

  const allTenders: PLACSPTender[] = [];

  // Feed configurations: [url pattern, label, isMinor]
  const feeds: [string, string, boolean][] = [
    // Main tenders
    [`https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3_{{YM}}.zip`, 'licitaciones', false],
    // Minor contracts (bomberos, vigilancia, suministros menores...)
    [`https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_1143/contratosMenoresPerfilesContratantes_{{YM}}.zip`, 'contratos_menores', true],
    // Aggregated platforms (cabildos, diputaciones, entities without own PLACSP profile)
    [`https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_644/licitacionesAgregadas_{{YM}}.zip`, 'plataformas_agregadas', false],
    // Encargos a medios propios (direct assignments to public companies)
    [`https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_1383/encargosMediosPropios_{{YM}}.zip`, 'encargos_medios_propios', false],
  ];
  
  for (const ym of months) {
    for (const [urlPattern, label, isMinor] of feeds) {
      const url = urlPattern.replace('{{YM}}', ym);
      try {
        const tenders = await fetchPLACSPTenders(ym, url, label, isMinor);
        allTenders.push(...tenders);
      } catch (e: any) {
        console.error(`[PLACSP] Error fetching ${label} ${ym}:`, e?.message);
      }
    }
  }

  // 4. Consultas Preliminares de Mercado (CPM) — annual feed, sets tenderPhase='pre_licitacion'
  const currentYear = `${now.getFullYear()}`;
  const cpmYears = [currentYear, `${now.getFullYear() - 1}`];
  for (const y of cpmYears) {
    const cpmUrl = `https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_1403/CPM_SectorPublico_${y}.zip`;
    try {
      const tenders = await fetchPLACSPTenders(y, cpmUrl, 'consultas_preliminares', false, 'pre_licitacion');
      allTenders.push(...tenders);
    } catch (e: any) {
      console.error(`[PLACSP] Error fetching consultas_preliminares ${y}:`, e?.message);
    }
  }

  // Deduplicate by sourceId
  const seen = new Set<string>();
  return allTenders.filter(t => {
    if (seen.has(t.sourceId)) return false;
    seen.add(t.sourceId);
    return true;
  });
}