// Coordinates for Spanish CCAA capitals (for map markers) and regions
export const CCAA_DATA: Record<string, { name: string; lat: number; lng: number; provinces: string[] }> = {
  'Andalucía': { name: 'Andalucía', lat: 37.39, lng: -5.99, provinces: ['Almería', 'Cádiz', 'Córdoba', 'Granada', 'Huelva', 'Jaén', 'Málaga', 'Sevilla'] },
  'Aragón': { name: 'Aragón', lat: 41.65, lng: -0.88, provinces: ['Huesca', 'Teruel', 'Zaragoza'] },
  'Asturias': { name: 'Asturias', lat: 43.36, lng: -5.85, provinces: ['Asturias'] },
  'Islas Baleares': { name: 'Islas Baleares', lat: 39.57, lng: 2.65, provinces: ['Islas Baleares'] },
  'Canarias': { name: 'Canarias', lat: 28.12, lng: -15.43, provinces: ['Las Palmas', 'Santa Cruz de Tenerife'] },
  'Cantabria': { name: 'Cantabria', lat: 43.46, lng: -3.8, provinces: ['Cantabria'] },
  'Castilla-La Mancha': { name: 'Castilla-La Mancha', lat: 39.86, lng: -3.03, provinces: ['Albacete', 'Ciudad Real', 'Cuenca', 'Guadalajara', 'Toledo'] },
  'Castilla y León': { name: 'Castilla y León', lat: 41.65, lng: -4.72, provinces: ['Ávila', 'Burgos', 'León', 'Palencia', 'Salamanca', 'Segovia', 'Soria', 'Valladolid', 'Zamora'] },
  'Cataluña': { name: 'Cataluña', lat: 41.39, lng: 2.17, provinces: ['Barcelona', 'Girona', 'Lleida', 'Tarragona'] },
  'Extremadura': { name: 'Extremadura', lat: 38.91, lng: -6.34, provinces: ['Badajoz', 'Cáceres'] },
  'Galicia': { name: 'Galicia', lat: 42.88, lng: -8.54, provinces: ['A Coruña', 'Lugo', 'Ourense', 'Pontevedra'] },
  'Comunidad de Madrid': { name: 'Comunidad de Madrid', lat: 40.42, lng: -3.7, provinces: ['Madrid'] },
  'Región de Murcia': { name: 'Región de Murcia', lat: 37.98, lng: -1.13, provinces: ['Murcia'] },
  'Navarra': { name: 'Navarra', lat: 42.81, lng: -1.64, provinces: ['Navarra'] },
  'País Vasco': { name: 'País Vasco', lat: 43.26, lng: -2.93, provinces: ['Álava', 'Gipuzkoa', 'Bizkaia'] },
  'La Rioja': { name: 'La Rioja', lat: 42.46, lng: -2.44, provinces: ['La Rioja'] },
  'Comunidad Valenciana': { name: 'Comunidad Valenciana', lat: 39.47, lng: -0.38, provinces: ['Alicante', 'Castellón', 'Valencia'] },
  'Ceuta': { name: 'Ceuta', lat: 35.89, lng: -5.32, provinces: ['Ceuta'] },
  'Melilla': { name: 'Melilla', lat: 35.29, lng: -2.94, provinces: ['Melilla'] },
  'Ámbito Nacional': { name: 'Ámbito Nacional', lat: 40.0, lng: -3.4, provinces: [] },
};

export function getCcaaForProvince(province: string): string | null {
  for (const [ccaa, data] of Object.entries(CCAA_DATA)) {
    if ((data?.provinces ?? []).some((p: string) => p?.toLowerCase() === province?.toLowerCase())) return ccaa;
  }
  return null;
}

export const SCORE_COLORS = {
  high: '#16a34a',
  medium: '#ea580c',
  low: '#dc2626',
  new: '#2563eb',
};

export function getScoreColor(score: number): string {
  if (score >= 70) return SCORE_COLORS.high;
  if (score >= 40) return SCORE_COLORS.medium;
  return SCORE_COLORS.low;
}
