export interface ScoringBreakdown {
  cpvMatch: number;
  keywordTitle: number;
  keywordDescription: number;
  formacionDron: number;
  sensorKeyword: number;
  buyerType: number;
  buyerHistory: number;
  lotsFormacion: number;
  budgetRange: number;
  deadlineOk: number;
  espectaculoPenalty: number;
  cuasPenalty: number;
  total: number;
  excluded: boolean;
}

const DRONE_CPV = ['34711200', '35613000', '34711100', '34711400'];
const TITLE_KEYWORDS = ['uas', 'rpas', 'dron', 'drone', 'drones', 'uav', 'aeronave no tripulada', 'vehiculo aereo no tripulado', 'vehículo aéreo no tripulado'];
const DESC_KEYWORDS = ['uas', 'rpas', 'dron', 'drone', 'drones', 'uav', 'aeronave no tripulada', 'vehiculo aereo no tripulado', 'sistema aereo no tripulado'];
const FORMACION_KW = ['formacion', 'formación', 'piloto', 'capacitacion', 'capacitación', 'certificacion', 'certificación', 'habilitacion', 'habilitación', 'curso'];
const SENSOR_KW = ['camara termica', 'cámara térmica', 'termografica', 'termográfica', 'rtk', 'lidar', 'dock', 'multiespectral', 'zenmuse', 'matrice', 'flir'];

// ALL security/emergency buyer keywords — this is Jose's core market
const SECURITY_BUYERS = [
  'policia', 'policía', 'policia local', 'policía local', 'policia nacional', 'policía nacional',
  'policia canaria', 'policía canaria', 'policia autonomica', 'policía autonómica',
  'bomberos', 'bombero', 'extincion de incendios', 'extinción de incendios',
  'proteccion civil', 'protección civil',
  'guardia civil', 'benemerita', 'benemérita',
  'ume', 'unidad militar de emergencias',
  'emergencias', 'emergencia', 'salvamento', 'rescate',
  'seguridad publica', 'seguridad pública', 'seguridad ciudadana',
  'consorcio de extincion', 'consorcio de extinción',
  'fuerzas y cuerpos de seguridad', 'fcse',
  'direccion general de trafico', 'dirección general de tráfico', 'dgt',
  'ejercito', 'ejército', 'defensa', 'ministerio de defensa', 'armada',
  'consorcio provincial de bomberos', 'parque de bomberos',
  'prevencion de incendios', 'prevención de incendios',
  'vigilancia', 'vigilancia aerea', 'vigilancia aérea',
  'speis', 'sepei', 'seis',
  'cabildo', 'consejo insular',
];

// Hard exclusion keywords (weapons/military munitions)
const EXCLUDE_KW = ['uav armado', 'municion merodeadora', 'munición merodeadora', 'loitering munition'];

// Espectáculo/ocio penalty — NOT our market
const ESPECTACULO_KW = [
  'espectaculo', 'espectáculo', 'luminoso', 'luminosos',
  'show de drones', 'espectáculo de drones', 'espectaculo de drones',
  'fiesta del cielo', 'fiestas patronales', 'clausura de las fiestas',
  'drones luminosos', 'drone show', 'light show',
  'pirotecnia', 'fuegos artificiales',
  'evento cultural', 'evento festivo',
  'alquiler de drones para producciones', 'lloguer de drons',
  'audiovisual genérico', 'audiovisual generico', 'grabacion video', 'grabación vídeo',
];

// C-UAS penalty (counter-drone, not our product)
const CUAS_KW = ['c-uas', 'antidron', 'anti-dron', 'inhibidor', 'contrauas', 'contra-uas'];

// Military target drones (blancos aéreos) — not our market
const BLANCOS_KW = ['blanco aereo', 'blanco aéreo', 'blancos aereos', 'blancos aéreos', 'scrab', 'moai', 'blanco remolcador'];

function norm(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function scoreTender(tender: {
  title: string;
  description?: string | null;
  cpvCodes?: string | null;
  contractingBody?: string | null;
  buyerType?: string | null;
  budgetAmount?: number | null;
  deadline?: Date | string | null;
  lotsJson?: string | null;
}): ScoringBreakdown {
  const title = norm(tender?.title ?? '');
  const desc = norm(tender?.description ?? '');
  const cpvStr = norm(tender?.cpvCodes ?? '');
  const buyer = norm(tender?.contractingBody ?? '') + ' ' + norm(tender?.buyerType ?? '');
  const fullText = title + ' ' + desc;

  // Hard exclusion
  const excluded = EXCLUDE_KW.some((k: string) => fullText.includes(k));
  if (excluded) return { cpvMatch: 0, keywordTitle: 0, keywordDescription: 0, formacionDron: 0, sensorKeyword: 0, buyerType: 0, buyerHistory: 0, lotsFormacion: 0, budgetRange: 0, deadlineOk: 0, espectaculoPenalty: 0, cuasPenalty: 0, total: 0, excluded: true };

  let cpvMatch = DRONE_CPV.some((c: string) => cpvStr.includes(c)) ? 30 : 0;
  let keywordTitle = TITLE_KEYWORDS.some((k: string) => title.includes(k)) ? 25 : 0;
  let keywordDescription = (!keywordTitle && DESC_KEYWORDS.some((k: string) => desc.includes(k))) ? 20 : 0;
  let formacionDron = (FORMACION_KW.some((k: string) => fullText.includes(k)) && DESC_KEYWORDS.some((k: string) => fullText.includes(k))) ? 25 : 0;
  let sensorKeyword = SENSOR_KW.some((k: string) => fullText.includes(k)) ? 20 : 0;
  let buyerTypeScore = SECURITY_BUYERS.some((k: string) => buyer.includes(k)) ? 20 : 0;
  // Also check title/desc for security body mentions
  if (!buyerTypeScore) {
    buyerTypeScore = SECURITY_BUYERS.some((k: string) => fullText.includes(k)) ? 15 : 0;
  }
  let buyerHistory = 0;
  let lotsFormacion = 0;
  try {
    const lots = JSON.parse(tender?.lotsJson ?? '[]');
    if (Array.isArray(lots) && lots.some((l: any) => norm(l?.title ?? '').includes('formacion') || norm(l?.title ?? '').includes('mantenimiento'))) {
      lotsFormacion = 15;
    }
  } catch {}
  let budgetRange = 0;
  const amt = tender?.budgetAmount ?? 0;
  if (amt >= 5000 && amt <= 2000000) budgetRange = 10;

  let deadlineOk = 0;
  if (tender?.deadline) {
    const dl = new Date(tender.deadline);
    const now = new Date();
    const diff = (dl.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diff > 7) deadlineOk = 10;
  }

  // Heavy penalties for espectáculo/ocio — not our market
  let espectaculoPenalty = 0;
  if (ESPECTACULO_KW.some((k: string) => fullText.includes(k))) espectaculoPenalty = -40;
  // Blancos aéreos militares — not relevant
  if (BLANCOS_KW.some((k: string) => fullText.includes(k))) espectaculoPenalty = Math.min(espectaculoPenalty, -30);

  let cuasPenalty = CUAS_KW.some((k: string) => fullText.includes(k)) ? -20 : 0;

  const raw = cpvMatch + keywordTitle + keywordDescription + formacionDron + sensorKeyword + buyerTypeScore + buyerHistory + lotsFormacion + budgetRange + deadlineOk + espectaculoPenalty + cuasPenalty;
  const total = Math.max(0, Math.min(100, raw));

  return { cpvMatch, keywordTitle, keywordDescription, formacionDron, sensorKeyword, buyerType: buyerTypeScore, buyerHistory, lotsFormacion, budgetRange, deadlineOk, espectaculoPenalty, cuasPenalty, total, excluded };
}

export function classifyTender(tender: { title: string; description?: string | null; cpvCodes?: string | null; budgetAmount?: number | null }): string {
  const text = norm((tender?.title ?? '') + ' ' + (tender?.description ?? ''));
  const cpv = tender?.cpvCodes ?? '';
  
  // Espectáculo (filtered out / very low priority)
  if (ESPECTACULO_KW.some(k => text.includes(k))) return 'espectaculo_ocio';
  
  if (text.includes('formacion') || text.includes('piloto') || text.includes('curso') || text.includes('habilitacion') || cpv.includes('80530000') || cpv.includes('80531200')) return 'formacion_pilotos';
  if (text.includes('lidar') || text.includes('termic') || text.includes('multiespectral') || text.includes('sensor') || text.includes('zenmuse') || text.includes('flir')) return 'sensores_lidar_termico';
  if (text.includes('emergencia') || text.includes('rescate') || text.includes('bombero') || text.includes('incendio') || text.includes('salvamento')) return 'emergencias_rescate';
  if (text.includes('vigilancia') || text.includes('seguridad') || text.includes('policia') || text.includes('policía') || text.includes('guardia civil')) return 'seguridad_vigilancia';
  if (text.includes('topograf') || text.includes('cartograf') || text.includes('fotogrametria') || text.includes('fotogrametría')) return 'topografia_cartografia';
  if (text.includes('mantenimiento') || text.includes('reparacion') || text.includes('reparación')) return 'mantenimiento_reparacion';
  if (text.includes('software') || text.includes('gis') || text.includes('gestion de datos') || text.includes('gestión de datos')) return 'software_gestion_datos';
  if (text.includes('operacion') || text.includes('operación') || text.includes('servicio de vuelo') || text.includes('trabajo aereo')) return 'servicio_operacion_dron';
  return 'venta_dron_enterprise';
}

// ================================================================
// FILTRO DE OBJETO: ¿COMPRA/FORMACIÓN o SERVICIO CON DRON?
// Solo interesan: compra de drones/equipamiento + formación pilotos
// NO interesan: servicios prestados CON dron (inspección, topografía, vídeo, etc.)
// ================================================================

// Keywords that indicate PURCHASING hardware/equipment (INCLUDE)
const PURCHASE_KW = [
  'adquisicion', 'adquisición', 'suministro', 'compra', 'adquirir',
  'suministrar', 'aprovisionamiento', 'dotacion', 'dotación',
  'equipamiento', 'lote', 'unidades', 'kit', 'baterias', 'baterías',
  'accesorios', 'repuestos', 'renting', 'arrendamiento',
  'matrice', 'mavic', 'phantom', 'mini', 'zenmuse', 'flir',
  'dji', 'skydio', 'parrot', 'autel', 'quantum', 'aertec',
  'ala fija', 'ala rotatoria', 'multirrotor', 'quadcopter',
  'estacion de carga', 'estación de carga', 'dock', 'd-rtk',
  'rpas clase', 'micro rpas', 'mini rpas',
];

// Keywords that indicate TRAINING/COURSES (INCLUDE)
const TRAINING_KW = [
  'formacion', 'formación', 'curso', 'cursos', 'capacitacion', 'capacitación',
  'habilitacion', 'habilitación', 'certificacion', 'certificación',
  'piloto remoto', 'piloto de dron', 'piloto de drone',
  'escenario estandar', 'escenario estándar', 'sts',
  'categoria a1', 'categoría a1', 'categoria a2', 'categoría a2',
  'competencia piloto', 'aesa piloto',
];

// Keywords that indicate SERVICES performed WITH drones (EXCLUDE)
const SERVICE_KW = [
  'servicio de inspeccion', 'servicio de inspección',
  'servicio de vigilancia', 'servicio de seguridad',
  'servicio de grabacion', 'servicio de grabación',
  'servicio de fotografia', 'servicio de fotografía',
  'servicio de topografia', 'servicio de topografía',
  'servicio de cartografia', 'servicio de cartografía',
  'servicio de fotogrametria', 'servicio de fotogrametría',
  'servicio de fumigacion', 'servicio de fumigación',
  'servicio aereo audiovisual', 'servicio aéreo audiovisual',
  'tratamiento fitosanitario', 'tratamientos fitosanitarios',
  'trabajo aereo', 'trabajo aéreo', 'trabajos aereos', 'trabajos aéreos',
  'vuelo con dron', 'vuelos con dron',
  'horas de vuelo', 'hora de vuelo',
  'grabacion con dron', 'grabación con dron',
  'fotografia aerea', 'fotografía aérea',
  'video aereo', 'vídeo aéreo',
  'levantamiento topografico', 'levantamiento topográfico',
  'inspeccion tecnica', 'inspección técnica',
  'inspeccion de infraestructura', 'inspección de infraestructura',
  'dron submarino', 'dron marino', 'rov', 'auv',
  'seguro de dron', 'seguro de aviacion', 'seguro de aviación',
  'poliza de responsabilidad', 'póliza de responsabilidad',
  'servicio de video con dron', 'servicio de vídeo con dron',
  'grabacion de imagenes aereas', 'grabación de imágenes aéreas',
  'telas para evento', 'intercomunicador',
  'estrategia de impulso', 'ecosistema de drones',
  'jornada sobre drones',
];

/**
 * Determines the "object type" of a tender:
 * - 'compra': Purchase/supply of drones or equipment → RELEVANT for Jose
 * - 'formacion': Training/courses for drone pilots → RELEVANT for Jose  
 * - 'servicio': Service performed WITH drones → NOT relevant
 * - 'otro': Tangential mention or unclear → NOT relevant
 */
export function getTenderObjectType(title: string, description?: string | null): 'compra' | 'formacion' | 'servicio' | 'otro' {
  const text = norm((title ?? '') + ' ' + (description ?? ''));
  
  // Check for service keywords first (more specific)
  const isService = SERVICE_KW.some(k => text.includes(k));
  
  // Check for purchase keywords
  const isPurchase = PURCHASE_KW.some(k => text.includes(k));
  
  // Check for training keywords
  const isTraining = TRAINING_KW.some(k => text.includes(k));
  
  // Training takes priority
  if (isTraining && !isService) return 'formacion';
  if (isTraining && isPurchase) return 'formacion'; // training + purchase = training
  
  // Purchase takes priority over service if both match
  // (e.g., "adquisición de dron para servicio de vigilancia" = BUYING a drone)
  if (isPurchase && !isService) return 'compra';
  if (isPurchase && isService) {
    // Ambiguous - check if title specifically starts with purchase keyword
    const titleNorm = norm(title ?? '');
    if (PURCHASE_KW.some(k => titleNorm.startsWith(k) || titleNorm.includes('adquisicion') || titleNorm.includes('suministro'))) return 'compra';
    return 'servicio';
  }
  
  if (isService) return 'servicio';
  
  // If no keywords match but has drone CPV, likely a purchase
  // Default: check if title mentions drone-related nouns without service context
  const hasDroneKw = TITLE_KEYWORDS.some(k => text.includes(k));
  if (hasDroneKw) {
    // If it mentions espectáculo it's neither
    if (ESPECTACULO_KW.some(k => text.includes(k))) return 'otro';
    return 'compra'; // default drone mention = purchase
  }
  
  return 'otro';
}

export const OBJECT_TYPE_LABELS: Record<string, string> = {
  compra: 'Venta/Suministro',
  formacion: 'Formación',
  servicio: 'Servicio (no relevante)',
  otro: 'Otro (no relevante)',
};

export const CLASSIFICATION_LABELS: Record<string, string> = {
  venta_dron_enterprise: 'Dron Enterprise',
  formacion_pilotos: 'Formación Pilotos',
  servicio_operacion_dron: 'Servicio Operación',
  mantenimiento_reparacion: 'Mantenimiento',
  software_gestion_datos: 'Software/GIS',
  sensores_lidar_termico: 'Sensores/LiDAR',
  emergencias_rescate: 'Emergencias/Rescate',
  seguridad_vigilancia: 'Seguridad/Vigilancia',
  topografia_cartografia: 'Topografía/Cartografía',
  espectaculo_ocio: 'Espectáculo/Ocio (no relevante)',
};
