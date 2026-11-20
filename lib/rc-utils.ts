export const RC_STATUSES = [
  "PENDIENTE",
  "CONCEDIDA",
  "PEDIDO_REALIZADO",
  "RECHAZADA",
  "CANCELADA",
] as const;

export type RcStatus = (typeof RC_STATUSES)[number];

export const RC_STATUS_LABELS: Record<string, string> = {
  PENDIENTE: "Pendiente de RC",
  CONCEDIDA: "RC concedida",
  PEDIDO_REALIZADO: "Pedido realizado",
  RECHAZADA: "Rechazada",
  CANCELADA: "Cancelada",
};

// Tailwind badge classes per status (light + dark)
export const RC_STATUS_BADGE: Record<string, string> = {
  PENDIENTE:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  CONCEDIDA:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  PEDIDO_REALIZADO:
    "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  RECHAZADA:
    "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  CANCELADA:
    "bg-gray-200 text-gray-500 line-through dark:bg-gray-700/40 dark:text-gray-400",
};
