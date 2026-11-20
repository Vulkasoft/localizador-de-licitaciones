export const ORDER_STATUSES = [
  "SOLICITADO",
  "CONFIRMADO",
  "EN_TRANSITO",
  "EN_ADUANA",
  "RECIBIDO",
  "INCIDENCIA",
  "CANCELADO",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<string, string> = {
  SOLICITADO: "Solicitado",
  CONFIRMADO: "Confirmado",
  EN_TRANSITO: "En tránsito",
  EN_ADUANA: "En aduana",
  RECIBIDO: "Recibido",
  INCIDENCIA: "Incidencia",
  CANCELADO: "Cancelado",
};

// Tailwind badge classes per status (light + dark)
export const ORDER_STATUS_BADGE: Record<string, string> = {
  SOLICITADO:
    "bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200",
  CONFIRMADO:
    "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  EN_TRANSITO:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  EN_ADUANA:
    "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  RECIBIDO:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  INCIDENCIA:
    "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  CANCELADO:
    "bg-gray-200 text-gray-500 line-through dark:bg-gray-700/40 dark:text-gray-400",
};

export const ORDER_FILE_TYPE_LABELS: Record<string, string> = {
  FACTURA_PAGO: "Factura de pago",
  TRANSFERENCIA: "Transferencia",
  OTRO: "Otro documento",
};
