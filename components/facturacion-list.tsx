"use client";

import { useEffect, useState, useCallback } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { CustomerCombobox } from "@/components/customer-combobox";
import { Search, Loader2, CheckCircle2, Save, RefreshCw, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";

/** Sede derived from the Contasimple number prefix: C- = Canarias, P- = Península. */
function sedeFromNumber(n?: string | null): "Canarias" | "Península" | null {
  if (!n) return null;
  const u = n.trim().toUpperCase();
  if (u.startsWith("C-")) return "Canarias";
  if (u.startsWith("P-")) return "Península";
  return null;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 2019 }, (_, i) => CURRENT_YEAR - i);

type ColKey =
  | "cliente"
  | "sede"
  | "numero"
  | "total"
  | "facturado"
  | "numeroFactura"
  | "fechaFactura";

const COLUMNS: { key: ColKey; label: string }[] = [
  { key: "cliente", label: "Cliente" },
  { key: "sede", label: "Sede" },
  { key: "numero", label: "N.º Presupuesto" },
  { key: "total", label: "Total" },
  { key: "facturado", label: "Facturado" },
  { key: "numeroFactura", label: "N.º Factura" },
  { key: "fechaFactura", label: "Fecha factura" },
];

const DEFAULT_COLS: Record<ColKey, boolean> = {
  cliente: true,
  sede: true,
  numero: true,
  total: true,
  facturado: true,
  numeroFactura: true,
  fechaFactura: true,
};

const COLS_STORAGE_KEY = "facturacion_visible_cols_v1";

interface Budget {
  id: string;
  nombre: string | null;
  cliente: string | null;
  contasimpleNumber?: string | null;
  totalConIva?: number | null;
  estado: string;
  facturado?: boolean;
  numeroFactura?: string | null;
  fechaFactura?: string | null;
  customer?: { id: string; nombre: string } | null;
}

function formatCurrency(value?: number | null): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function toDateInput(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function FacturacionList() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [numero, setNumero] = useState("");
  const debouncedNumero = useDebounce(numero, 400);
  const [estadoFactura, setEstadoFactura] = useState<"todos" | "facturado" | "pendiente">("todos");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerLabel, setCustomerLabel] = useState<string>("");
  const [sede, setSede] = useState("");
  const [comunidad, setComunidad] = useState("");
  const [provincias, setProvincias] = useState<string[]>([]);
  const [anio, setAnio] = useState("");
  const [trimestre, setTrimestre] = useState("");
  const [sortBy, setSortBy] = useState("fecha_desc");

  // Column visibility
  const [visibleCols, setVisibleCols] = useState<Record<ColKey, boolean>>(DEFAULT_COLS);
  const [showColMenu, setShowColMenu] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLS_STORAGE_KEY);
      if (saved) setVisibleCols({ ...DEFAULT_COLS, ...JSON.parse(saved) });
    } catch { /* ignore */ }
  }, []);

  const toggleCol = (key: ColKey) => {
    setVisibleCols((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // Per-row draft edits
  const [drafts, setDrafts] = useState<Record<string, { numeroFactura: string; fechaFactura: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingBulk, setSyncingBulk] = useState(false);

  const fetchBudgets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (debouncedNumero) params.set("numero", debouncedNumero);
      if (customerId) params.set("customerId", customerId);
      if (sede) params.set("sede", sede);
      if (comunidad) params.set("comunidad", comunidad);
      if (sortBy) params.set("sortBy", sortBy);
      if (anio) {
        const y = parseInt(anio);
        if (trimestre) {
          const q = parseInt(trimestre);
          const startMonth = (q - 1) * 3;
          const endMonth = startMonth + 2;
          const lastDay = new Date(y, endMonth + 1, 0).getDate();
          params.set("fechaDesde", `${y}-${String(startMonth + 1).padStart(2, "0")}-01`);
          params.set("fechaHasta", `${y}-${String(endMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`);
        } else {
          params.set("fechaDesde", `${y}-01-01`);
          params.set("fechaHasta", `${y}-12-31`);
        }
      }

      const res = await fetch(`/api/budgets?${params.toString()}`);
      if (!res.ok) throw new Error("Error al cargar");
      const data = await res.json();
      let list: Budget[] = data.budgets || [];
      if (estadoFactura === "facturado") list = list.filter((b) => b.facturado);
      if (estadoFactura === "pendiente") list = list.filter((b) => !b.facturado);
      setBudgets(list);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotal(data.pagination?.total || 0);
      // Seed drafts
      const seed: Record<string, { numeroFactura: string; fechaFactura: string }> = {};
      for (const b of list) {
        seed[b.id] = {
          numeroFactura: b.numeroFactura || "",
          fechaFactura: toDateInput(b.fechaFactura),
        };
      }
      setDrafts(seed);
    } catch (e) {
      toast.error("No se pudieron cargar los presupuestos");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, debouncedNumero, customerId, estadoFactura, sede, comunidad, anio, trimestre, sortBy]);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, debouncedNumero, customerId, estadoFactura, sede, comunidad, anio, trimestre, sortBy]);

  // Load distinct provinces so the province filter only offers real values.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/budgets?distinctProvincias=true");
        if (!res.ok) return;
        const data = await res.json();
        setProvincias(Array.isArray(data.provincias) ? data.provincias : []);
      } catch { /* ignore */ }
    })();
  }, []);

  const updateDraft = (id: string, field: "numeroFactura" | "fechaFactura", value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const saveBudget = async (b: Budget, facturadoOverride?: boolean) => {
    setSavingId(b.id);
    try {
      const draft = drafts[b.id] || { numeroFactura: "", fechaFactura: "" };
      const facturado = facturadoOverride !== undefined ? facturadoOverride : b.facturado;
      const res = await fetch(`/api/budgets/${b.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facturado,
          numeroFactura: draft.numeroFactura || null,
          fechaFactura: draft.fechaFactura || null,
        }),
      });
      if (!res.ok) throw new Error("Error");
      toast.success("Facturación actualizada");
      await fetchBudgets();
    } catch (e) {
      toast.error("No se pudo guardar");
    } finally {
      setSavingId(null);
    }
  };

  const toggleFacturado = (b: Budget) => saveBudget(b, !b.facturado);

  const syncRow = async (b: Budget) => {
    setSyncingId(b.id);
    try {
      const res = await fetch(`/api/budgets/${b.id}/contasimple-invoice-sync`, {
        method: "POST",
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d?.error || "No se pudo sincronizar con Contasimple");
        return;
      }
      if (d?.facturado) {
        toast.success(`Factura encontrada en Contasimple${d?.numeroFactura ? ` (nº ${d.numeroFactura})` : ""}`);
      } else {
        toast.info("Este presupuesto aún no tiene factura emitida en Contasimple");
      }
      await fetchBudgets();
    } catch (e) {
      toast.error("No se pudo sincronizar con Contasimple");
    } finally {
      setSyncingId(null);
    }
  };

  const syncAll = async () => {
    if (budgets.length === 0) return;
    setSyncingBulk(true);
    try {
      const res = await fetch(`/api/facturacion/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: budgets.map((b) => b.id) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d?.error || "No se pudo sincronizar con Contasimple");
        return;
      }
      toast.success(
        `Sincronizados ${d?.revisados ?? 0} · ${d?.facturados ?? 0} con factura emitida`
      );
      await fetchBudgets();
    } catch (e) {
      toast.error("No se pudo sincronizar con Contasimple");
    } finally {
      setSyncingBulk(false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setNumero("");
    setEstadoFactura("todos");
    setCustomerId(null);
    setCustomerLabel("");
    setSede("");
    setComunidad("");
    setAnio("");
    setTrimestre("");
    setSortBy("fecha_desc");
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por nombre o cliente…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Input
            placeholder="Nº de presupuesto…"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
          />
          <CustomerCombobox
            value={customerId}
            initialLabel={customerLabel}
            onChange={(id, label) => {
              setCustomerId(id);
              setCustomerLabel(label ?? "");
            }}
            placeholder="Filtrar por cliente…"
          />
          <Select
            value={estadoFactura}
            onValueChange={(v) => setEstadoFactura(v as any)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Estado de facturación" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="facturado">Facturados</SelectItem>
              <SelectItem value="pendiente">Pendientes de facturar</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sede || "all"} onValueChange={(v) => setSede(v === "all" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Sede" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las sedes</SelectItem>
              <SelectItem value="peninsula">Península</SelectItem>
              <SelectItem value="canarias">Canarias</SelectItem>
            </SelectContent>
          </Select>

          <Select value={comunidad || "all"} onValueChange={(v) => setComunidad(v === "all" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Provincia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las provincias</SelectItem>
              {provincias.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={anio || "all"} onValueChange={(v) => setAnio(v === "all" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Año" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los años</SelectItem>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={trimestre || "all"} onValueChange={(v) => setTrimestre(v === "all" ? "" : v)} disabled={!anio}>
            <SelectTrigger>
              <SelectValue placeholder="Trimestre" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo el año</SelectItem>
              <SelectItem value="1">1.º trimestre</SelectItem>
              <SelectItem value="2">2.º trimestre</SelectItem>
              <SelectItem value="3">3.º trimestre</SelectItem>
              <SelectItem value="4">4.º trimestre</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fecha_desc">Más reciente primero</SelectItem>
              <SelectItem value="fecha_asc">Más antiguo primero</SelectItem>
              <SelectItem value="total_desc">Importe: mayor a menor</SelectItem>
              <SelectItem value="total_asc">Importe: menor a mayor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-500">{total} presupuesto(s)</p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={syncAll}
              disabled={syncingBulk || loading || budgets.length === 0}
            >
              {syncingBulk ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Sincronizar facturas con Contasimple
            </Button>
            <div className="relative">
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setShowColMenu((s) => !s)}>
                <SlidersHorizontal className="h-4 w-4" /> Columnas
              </Button>
              {showColMenu && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowColMenu(false)} />
                  <div className="absolute right-0 z-30 mt-1 w-56 rounded-lg border bg-popover shadow-lg p-2">
                    <p className="text-xs text-gray-500 px-2 py-1">Decide qué columnas ver</p>
                    {COLUMNS.map((c) => (
                      <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted cursor-pointer">
                        <input type="checkbox" checked={visibleCols[c.key]} onChange={() => toggleCol(c.key)} />
                        {c.label}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Quitar filtros
            </Button>
          </div>
        </div>
      </Card>

      {/* Vista mobile: tarjetas */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <Card className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></Card>
        ) : budgets.length === 0 ? (
          <Card className="py-16 text-center text-gray-500 text-sm">No hay presupuestos que coincidan con los filtros.</Card>
        ) : (
          budgets.map((b) => {
            const draft = drafts[b.id] || { numeroFactura: "", fechaFactura: "" };
            const clienteNombre = b.customer?.nombre || b.cliente || "—";
            const s = sedeFromNumber(b.contasimpleNumber);
            return (
              <Card key={b.id} className={"p-4 " + (b.facturado ? "bg-green-50/50 dark:bg-green-900/10" : "")}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold break-words">{b.nombre || "(sin nombre)"}</p>
                    <p className="text-xs text-gray-500 break-words">{clienteNombre}</p>
                  </div>
                  {s && (
                    <span className={"inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 " + (s === "Canarias" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300")}>{s}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400 mb-3">
                  {b.contasimpleNumber && <span className="font-mono">{b.contasimpleNumber}</span>}
                  <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{formatCurrency(b.totalConIva)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <Input value={draft.numeroFactura} onChange={(e) => updateDraft(b.id, "numeroFactura", e.target.value)} placeholder="Nº factura..." />
                  <Input type="date" value={draft.fechaFactura} onChange={(e) => updateDraft(b.id, "fechaFactura", e.target.value)} />
                </div>
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
                  <Button variant={b.facturado ? "default" : "outline"} size="sm" onClick={() => toggleFacturado(b)} disabled={savingId === b.id} className={b.facturado ? "bg-green-600 hover:bg-green-700" : ""}>
                    <CheckCircle2 className="h-4 w-4 mr-1" />{b.facturado ? "Facturado" : "No facturado"}
                  </Button>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => syncRow(b)} disabled={syncingId === b.id} title="Sincronizar con Contasimple">
                      {syncingId === b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => saveBudget(b)} disabled={savingId === b.id}>
                      {savingId === b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Guardar</>}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      <Card className="hidden md:block overflow-hidden overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : budgets.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            No hay presupuestos que coincidan con los filtros.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Presupuesto</TableHead>
                {visibleCols.cliente && <TableHead>Cliente</TableHead>}
                {visibleCols.sede && <TableHead>Sede</TableHead>}
                {visibleCols.numero && <TableHead>Nº Ppto.</TableHead>}
                {visibleCols.total && <TableHead className="text-right">Total</TableHead>}
                {visibleCols.facturado && <TableHead className="text-center">Facturado</TableHead>}
                {visibleCols.numeroFactura && <TableHead>Nº Factura</TableHead>}
                {visibleCols.fechaFactura && <TableHead>Fecha factura</TableHead>}
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {budgets.map((b) => {
                const draft = drafts[b.id] || { numeroFactura: "", fechaFactura: "" };
                const clienteNombre = b.customer?.nombre || b.cliente || "—";
                return (
                  <TableRow key={b.id} className={b.facturado ? "bg-green-50/50 dark:bg-green-900/10" : ""}>
                    <TableCell className="font-medium max-w-[220px] truncate">
                      {b.nombre || "(sin nombre)"}
                    </TableCell>
                    {visibleCols.cliente && (
                      <TableCell className="max-w-[180px] truncate">{clienteNombre}</TableCell>
                    )}
                    {visibleCols.sede && (
                      <TableCell>
                        {(() => {
                          const s = sedeFromNumber(b.contasimpleNumber);
                          if (!s) return <span className="text-gray-400">—</span>;
                          return (
                            <span
                              className={
                                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium " +
                                (s === "Canarias"
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                                  : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300")
                              }
                            >
                              {s}
                            </span>
                          );
                        })()}
                      </TableCell>
                    )}
                    {visibleCols.numero && (
                      <TableCell className="whitespace-nowrap">{b.contasimpleNumber || "—"}</TableCell>
                    )}
                    {visibleCols.total && (
                      <TableCell className="text-right whitespace-nowrap">{formatCurrency(b.totalConIva)}</TableCell>
                    )}
                    {visibleCols.facturado && (
                      <TableCell className="text-center">
                        <Button
                          variant={b.facturado ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleFacturado(b)}
                          disabled={savingId === b.id}
                          className={b.facturado ? "bg-green-600 hover:bg-green-700" : ""}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          {b.facturado ? "Sí" : "No"}
                        </Button>
                      </TableCell>
                    )}
                    {visibleCols.numeroFactura && (
                      <TableCell>
                        <Input
                          value={draft.numeroFactura}
                          onChange={(e) => updateDraft(b.id, "numeroFactura", e.target.value)}
                          placeholder="Nº..."
                          className="w-28"
                        />
                      </TableCell>
                    )}
                    {visibleCols.fechaFactura && (
                      <TableCell>
                        <Input
                          type="date"
                          value={draft.fechaFactura}
                          onChange={(e) => updateDraft(b.id, "fechaFactura", e.target.value)}
                          className="w-40"
                        />
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => syncRow(b)}
                          disabled={syncingId === b.id}
                          title="Sincronizar con Contasimple"
                        >
                          {syncingId === b.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => saveBudget(b)}
                          disabled={savingId === b.id}
                        >
                          {savingId === b.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Save className="h-4 w-4 mr-1" /> Guardar
                            </>
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <span className="text-sm text-gray-500">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Siguiente
          </Button>
        </div>
      )}
    </div>
  );
}
