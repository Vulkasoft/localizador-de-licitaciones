"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  Edit,
  Trash,
  Loader2,
  PiggyBank,
  Paperclip,
  ChevronLeft,
  ChevronRight,
  Link2 as LinkIcon,
  CheckCircle2,
  RotateCcw,
  TrendingUp,
  Coins,
  Wallet,
} from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { toast } from "sonner";
import {
  PROFIT_STATUSES,
  PROFIT_STATUS_LABELS,
  PROFIT_STATUS_BADGE,
  formatEur,
  monthLabel,
} from "@/lib/profit-utils";

function formatDate(dateString?: string | null) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface ProfitFile {
  id: string;
  filename: string;
  tipo: string;
}
interface ProfitShare {
  id: string;
  concepto?: string | null;
  referencia?: string | null;
  referenciaTipo?: string | null;
  budgetId?: string | null;
  importeVenta?: number | null;
  beneficio: number;
  parteVulkasoft: number;
  parteBluedrone: number;
  estado: string;
  fechaVenta?: string | null;
  fechaPago?: string | null;
  files: ProfitFile[];
  createdAt: string;
}

interface MonthSummary {
  key: string;
  beneficio: number;
  parteVulkasoft: number;
  parteBluedrone: number;
  pagado: number;
  pendiente: number;
  count: number;
}
interface Totals {
  beneficio: number;
  parteVulkasoft: number;
  parteBluedrone: number;
  pagado: number;
  pendiente: number;
  count: number;
  countPagado: number;
  countPendiente: number;
}

function StatusBadge({ estado }: { estado: string }) {
  return (
    <span
      className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${
        PROFIT_STATUS_BADGE[estado] ?? PROFIT_STATUS_BADGE.PENDIENTE
      }`}
    >
      {PROFIT_STATUS_LABELS[estado] ?? estado}
    </span>
  );
}

export function ProfitList() {
  const [items, setItems] = useState<ProfitShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<string>("ALL");
  const [month, setMonth] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [months, setMonths] = useState<MonthSummary[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 400);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("query", debouncedSearch);
      if (estado !== "ALL") params.set("estado", estado);
      if (month !== "ALL") params.set("month", month);
      params.set("page", String(page));
      params.set("pageSize", "20");
      const res = await fetch(`/api/profit-shares?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.profitShares ?? []);
      setTotalPages(data.totalPages ?? 1);
      setTotal(data.total ?? 0);
      setTotals(data.summary?.totals ?? null);
      setMonths(data.summary?.months ?? []);
    } catch {
      toast.error("Error al cargar los beneficios");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, estado, month, page]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, estado, month]);

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "¿Eliminar este registro de beneficio y sus documentos? Esta acción no se puede deshacer."
      )
    )
      return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/profit-shares/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Registro eliminado");
      fetchItems();
    } catch {
      toast.error("Error al eliminar el registro");
    } finally {
      setDeletingId(null);
    }
  };

  const togglePaid = async (item: ProfitShare) => {
    const nuevo = item.estado === "PAGADO" ? "PENDIENTE" : "PAGADO";
    setUpdatingId(item.id);
    try {
      const res = await fetch(`/api/profit-shares/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estado: nuevo,
          fechaPago:
            nuevo === "PAGADO"
              ? item.fechaPago || new Date().toISOString().slice(0, 10)
              : null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(nuevo === "PAGADO" ? "Marcado como pagado" : "Marcado como pendiente");
      fetchItems();
    } catch {
      toast.error("No se pudo actualizar el estado");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <PiggyBank className="w-7 h-7 text-emerald-500" />
            Beneficios
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {total} {total === 1 ? "registro" : "registros"} · reparto 1/3 VulkaSoft · 2/3 Grupo Bluedrone
          </p>
        </div>
        <Link href="/beneficios/new">
          <Button className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Nuevo beneficio
          </Button>
        </Link>
      </div>

      {/* Global totals */}
      {totals && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1">
              <Coins className="w-4 h-4" /> Beneficio total
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {formatEur(totals.beneficio)}
            </p>
          </Card>
          <Card className="p-4 border-sky-200 dark:border-sky-800">
            <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400 text-xs mb-1">
              <TrendingUp className="w-4 h-4" /> Tu parte (VulkaSoft)
            </div>
            <p className="text-xl font-bold text-sky-700 dark:text-sky-300">
              {formatEur(totals.parteVulkasoft)}
            </p>
          </Card>
          <Card className="p-4 border-emerald-200 dark:border-emerald-800">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs mb-1">
              <CheckCircle2 className="w-4 h-4" /> Tuyo cobrado
            </div>
            <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
              {formatEur(totals.pagado)}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {totals.countPagado} pagado{totals.countPagado === 1 ? "" : "s"}
            </p>
          </Card>
          <Card className="p-4 border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs mb-1">
              <Wallet className="w-4 h-4" /> Tuyo pendiente
            </div>
            <p className="text-xl font-bold text-amber-700 dark:text-amber-300">
              {formatEur(totals.pendiente)}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {totals.countPendiente} pendiente{totals.countPendiente === 1 ? "" : "s"}
            </p>
          </Card>
        </div>
      )}

      {/* Monthly breakdown */}
      {months.length > 0 && (
        <Card className="p-4 mb-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" /> Resumen por mes
          </h2>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead className="text-right">Beneficio</TableHead>
                  <TableHead className="text-right">VulkaSoft (tú)</TableHead>
                  <TableHead className="text-right">Grupo Bluedrone</TableHead>
                  <TableHead className="text-right">Tuyo cobrado</TableHead>
                  <TableHead className="text-right">Tuyo pendiente</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map((m) => (
                  <TableRow
                    key={m.key}
                    className={`cursor-pointer ${
                      month === m.key ? "bg-emerald-50 dark:bg-emerald-950/30" : ""
                    }`}
                    onClick={() =>
                      setMonth((cur) => (cur === m.key ? "ALL" : m.key))
                    }
                  >
                    <TableCell className="font-medium">
                      {monthLabel(m.key)}
                    </TableCell>
                    <TableCell className="text-right">{formatEur(m.beneficio)}</TableCell>
                    <TableCell className="text-right text-sky-700 dark:text-sky-400 font-medium">
                      {formatEur(m.parteVulkasoft)}
                    </TableCell>
                    <TableCell className="text-right text-indigo-700 dark:text-indigo-400">
                      {formatEur(m.parteBluedrone)}
                    </TableCell>
                    <TableCell className="text-right text-emerald-700 dark:text-emerald-400">
                      {formatEur(m.pagado)}
                    </TableCell>
                    <TableCell className="text-right text-amber-700 dark:text-amber-400">
                      {formatEur(m.pendiente)}
                    </TableCell>
                    <TableCell className="text-right text-gray-500">{m.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {month !== "ALL" && (
            <button
              onClick={() => setMonth("ALL")}
              className="mt-2 text-xs text-sky-600 dark:text-sky-400 hover:underline"
            >
              Ver todos los meses
            </button>
          )}
        </Card>
      )}

      <Card className="p-4 mb-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por concepto, presupuesto/factura, notas..."
              className="pl-9"
            />
          </div>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los estados</SelectItem>
              {PROFIT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {PROFIT_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Cargando beneficios...
        </div>
      ) : items.length === 0 ? (
        <Card className="p-12 text-center">
          <PiggyBank className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            No hay beneficios que coincidan con la búsqueda.
          </p>
          <Link href="/beneficios/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Registrar el primer beneficio
            </Button>
          </Link>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Presup./Factura</TableHead>
                    <TableHead>Fecha venta</TableHead>
                    <TableHead className="text-right">Beneficio</TableHead>
                    <TableHead className="text-right">Tuyo (1/3)</TableHead>
                    <TableHead className="text-right">Bluedrone (2/3)</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Docs</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium max-w-[200px] truncate" title={o.concepto || ""}>
                        {o.concepto || "—"}
                      </TableCell>
                      <TableCell className="font-medium text-sky-700 dark:text-sky-400">
                        {o.referencia ? (
                          o.budgetId ? (
                            <Link
                              href={`/budgets/${o.budgetId}`}
                              className="inline-flex items-center gap-1 hover:underline"
                              title="Ver documento en Contasimple"
                            >
                              <LinkIcon className="h-3 w-3" />
                              {o.referencia}
                            </Link>
                          ) : (
                            o.referencia
                          )
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(o.fechaVenta)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatEur(o.beneficio)}
                      </TableCell>
                      <TableCell className="text-right text-sky-700 dark:text-sky-400 font-semibold">
                        {formatEur(o.parteVulkasoft)}
                      </TableCell>
                      <TableCell className="text-right text-indigo-700 dark:text-indigo-400">
                        {formatEur(o.parteBluedrone)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge estado={o.estado} />
                      </TableCell>
                      <TableCell>
                        {o.files.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400 text-sm">
                            <Paperclip className="w-3.5 h-3.5" />
                            {o.files.length}
                          </span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 ${
                              o.estado === "PAGADO"
                                ? "text-amber-500 hover:text-amber-600"
                                : "text-emerald-500 hover:text-emerald-600"
                            }`}
                            title={
                              o.estado === "PAGADO"
                                ? "Marcar como pendiente"
                                : "Marcar como pagado"
                            }
                            onClick={() => togglePaid(o)}
                            disabled={updatingId === o.id}
                          >
                            {updatingId === o.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : o.estado === "PAGADO" ? (
                              <RotateCcw className="w-4 h-4" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4" />
                            )}
                          </Button>
                          <Link href={`/beneficios/${o.id}/edit`}>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Edit className="w-4 h-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600"
                            onClick={() => handleDelete(o.id)}
                            disabled={deletingId === o.id}
                          >
                            {deletingId === o.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {items.map((o) => (
              <Card key={o.id} className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white truncate">
                      {o.concepto || "Beneficio sin concepto"}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {formatDate(o.fechaVenta)}
                      {o.referencia ? ` · ${o.referencia}` : ""}
                    </p>
                  </div>
                  <StatusBadge estado={o.estado} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center my-3">
                  <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-2">
                    <p className="text-[10px] text-gray-400">Beneficio</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">
                      {formatEur(o.beneficio)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-sky-50 dark:bg-sky-950/40 p-2">
                    <p className="text-[10px] text-sky-500">Tuyo</p>
                    <p className="text-sm font-bold text-sky-700 dark:text-sky-300">
                      {formatEur(o.parteVulkasoft)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-indigo-50 dark:bg-indigo-950/40 p-2">
                    <p className="text-[10px] text-indigo-500">Bluedrone</p>
                    <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
                      {formatEur(o.parteBluedrone)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400 text-sm">
                    <Paperclip className="w-3.5 h-3.5" />
                    {o.files.length} doc{o.files.length === 1 ? "" : "s"}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => togglePaid(o)}
                      disabled={updatingId === o.id}
                      className={
                        o.estado === "PAGADO"
                          ? "text-amber-600 border-amber-300"
                          : "text-emerald-600 border-emerald-300"
                      }
                    >
                      {updatingId === o.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : o.estado === "PAGADO" ? (
                        <>
                          <RotateCcw className="w-4 h-4 mr-1" /> Pendiente
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-1" /> Pagado
                        </>
                      )}
                    </Button>
                    <Link href={`/beneficios/${o.id}/edit`}>
                      <Button variant="outline" size="sm">
                        <Edit className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-red-500"
                      onClick={() => handleDelete(o.id)}
                      disabled={deletingId === o.id}
                    >
                      {deletingId === o.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-gray-600 dark:text-gray-300">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
