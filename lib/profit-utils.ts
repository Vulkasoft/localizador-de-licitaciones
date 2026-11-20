export const PROFIT_STATUSES = ["PENDIENTE", "PAGADO"] as const;

export type ProfitStatus = (typeof PROFIT_STATUSES)[number];

export const PROFIT_STATUS_LABELS: Record<string, string> = {
  PENDIENTE: "Pendiente de cobro",
  PAGADO: "Pagado",
};

// Tailwind badge classes per status (light + dark)
export const PROFIT_STATUS_BADGE: Record<string, string> = {
  PENDIENTE:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  PAGADO:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
};

export const PROFIT_FILE_TYPE_LABELS: Record<string, string> = {
  TRANSFERENCIA: "Transferencia (justificante de pago)",
  FACTURA_VULKASOFT: "Factura VulkaSoft → Grupo Bluedrone",
  OTRO: "Otro documento",
};

// Profit split: total profit is divided in 3 parts.
// VulkaSoft (Jose) = 1 part, Grupo Bluedrone = 2 parts.
// Round VulkaSoft to 2 decimals and give the remainder to Bluedrone so the
// two parts always add up exactly to the total profit.
export function splitProfit(beneficio: number): {
  parteVulkasoft: number;
  parteBluedrone: number;
} {
  const b = Number.isFinite(beneficio) ? beneficio : 0;
  const parteVulkasoft = Math.round((b / 3) * 100) / 100;
  const parteBluedrone = Math.round((b - parteVulkasoft) * 100) / 100;
  return { parteVulkasoft, parteBluedrone };
}

export function formatEur(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  return value.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
  });
}

// Parse a money string that may use comma or dot as decimal separator.
export function parseMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = String(value).trim().replace(/\s|€/g, "");
  if (!s) return null;
  // If both separators present, assume '.' thousands and ',' decimals.
  let normalized = s;
  if (s.includes(",") && s.includes(".")) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    normalized = s.replace(",", ".");
  }
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

// Returns a YYYY-MM key from a date-like value, or "sin-fecha".
export function monthKey(value?: string | Date | null): string {
  if (!value) return "sin-fecha";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "sin-fecha";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  if (key === "sin-fecha") return "Sin fecha de venta";
  const [y, m] = key.split("-");
  const idx = parseInt(m, 10) - 1;
  const name = MONTHS_ES[idx] ?? m;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}
