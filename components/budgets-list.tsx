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
import {
  Plus,
  Edit,
  Eye,
  Trash,
  Search,
  SlidersHorizontal,
  CheckCircle2,
  RefreshCw,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useDebounce } from "@/hooks/use-debounce";
import { toast } from "sonner";

/** Sede derived from the Contasimple number prefix: C- = Canarias, P- = Península. */
function sedeFromNumber(n?: string | null): "Canarias" | "Península" | null {
  if (!n) return null;
  const u = n.trim().toUpperCase();
  if (u.startsWith("C-")) return "Canarias";
  if (u.startsWith("P-")) return "Península";
  return null;
}

interface Budget {
  id: string;
  nombre: string;
  cliente: string;
  tipo: string;
  tipoCustom?: string | null;
  comunidadAutonoma: string;
  ciudad: string;
  fechaSolicitud: string;
  fechaPlazo: string | null;
  estado: string;
  contasimpleNumber?: string | null;
  totalConIva?: number | null;
  facturado?: boolean;
  numeroFactura?: string | null;
  files: any[];
}

interface BudgetsListProps {
  searchParams: {
    search?: string;
    estado?: string;
    tipo?: string;
    comunidad?: string;
    page?: string;
  };
}

type ColKey =
  | "numero"
  | "sede"
  | "cliente"
  | "nombre"
  | "tipo"
  | "comunidad"
  | "ciudad"
  | "fechaSolicitud"
  | "total"
  | "estado"
  | "facturado";

const COLUMNS: { key: ColKey; label: string }[] = [
  { key: "numero", label: "N.º Presupuesto" },
  { key: "sede", label: "Sede" },
  { key: "cliente", label: "Cliente" },
  { key: "nombre", label: "Nombre" },
  { key: "tipo", label: "Tipo" },
  { key: "comunidad", label: "Provincia" },
  { key: "ciudad", label: "Ciudad" },
  { key: "fechaSolicitud", label: "F. Solicitud" },
  { key: "total", label: "Importe" },
  { key: "estado", label: "Estado" },
  { key: "facturado", label: "Facturado" },
];

const DEFAULT_COLS: Record<ColKey, boolean> = {
  numero: true,
  sede: true,
  cliente: true,
  nombre: false,
  tipo: true,
  comunidad: true,
  ciudad: false,
  fechaSolicitud: true,
  total: true,
  estado: true,
  facturado: false,
};

const COLS_STORAGE_KEY = "budgets_visible_cols_v2";

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 2019 }, (_, i) => CURRENT_YEAR - i);

export function BudgetsList({ searchParams }: BudgetsListProps) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.search ?? "");
  const [estado, setEstado] = useState(searchParams.estado ?? "");
  const [tipo, setTipo] = useState(searchParams.tipo ?? "");
  const [comunidad, setComunidad] = useState(searchParams.comunidad ?? "");
  const [sede, setSede] = useState("");
  const [provincias, setProvincias] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerLabel, setCustomerLabel] = useState<string | null>(null);
  const [numero, setNumero] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [anio, setAnio] = useState("");
  const [trimestre, setTrimestre] = useState("");
  const [sortBy, setSortBy] = useState("fecha_desc");
  const [page, setPage] = useState(parseInt(searchParams.page ?? "1"));
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [visibleCols, setVisibleCols] = useState<Record<ColKey, boolean>>(DEFAULT_COLS);
  const [showColMenu, setShowColMenu] = useState(false);

  const debouncedSearch = useDebounce(search, 500);
  const debouncedNumero = useDebounce(numero, 500);

  // Load saved column preferences.
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

  const fetchBudgets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append("search", debouncedSearch);
      if (estado) params.append("estado", estado);
      if (tipo) params.append("tipo", tipo);
      if (comunidad) params.append("comunidad", comunidad);
      if (sede) params.append("sede", sede);
      if (customerId) params.append("customerId", customerId);
      if (debouncedNumero) params.append("numero", debouncedNumero);

      // Year / quarter drive the date range when a year is selected;
      // otherwise fall back to the manual Desde / Hasta inputs.
      let df = fechaDesde;
      let dh = fechaHasta;
      if (anio) {
        const y = parseInt(anio);
        if (trimestre) {
          const q = parseInt(trimestre);
          const startMonth = (q - 1) * 3;
          const endMonth = startMonth + 2;
          const lastDay = new Date(y, endMonth + 1, 0).getDate();
          df = `${y}-${String(startMonth + 1).padStart(2, "0")}-01`;
          dh = `${y}-${String(endMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        } else {
          df = `${y}-01-01`;
          dh = `${y}-12-31`;
        }
      }
      if (df) params.append("fechaDesde", df);
      if (dh) params.append("fechaHasta", dh);
      if (sortBy) params.append("sortBy", sortBy);
      params.append("page", page.toString());
      params.append("limit", "10");

      const response = await fetch(`/api/budgets?${params}`);
      const data = await response.json();

      setBudgets(data.budgets ?? []);
      setTotal(data.pagination?.total ?? 0);
      setTotalPages(data.pagination?.totalPages ?? 0);
    } catch (error) {
      console.error("Failed to fetch budgets:", error);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, estado, tipo, comunidad, sede, customerId, debouncedNumero, fechaDesde, fechaHasta, anio, trimestre, sortBy, page]);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  // Load the distinct list of provinces present in the data so the province
  // filter only offers values that actually match records.
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

  const syncEstimates = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/contasimple/cron-sync?scope=estimates", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d?.error || "No se pudo sincronizar con Contasimple");
        return;
      }
      const est = d?.estimates || {};
      const imp = (est.peninsula?.imported ?? 0) + (est.canarias?.imported ?? 0);
      const upd = (est.peninsula?.updated ?? 0) + (est.canarias?.updated ?? 0);
      toast.success(`Sincronización completada · ${imp} nuevos · ${upd} actualizados`);
      fetchBudgets();
    } catch (e) {
      toast.error("No se pudo sincronizar con Contasimple");
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteBudget = async (id: string) => {
    if (!confirm("¿Seguro que quieres eliminar este presupuesto?")) return;
    try {
      const response = await fetch(`/api/budgets/${id}`, { method: "DELETE" });
      if (response.ok) fetchBudgets();
    } catch (error) {
      console.error("Failed to delete budget:", error);
    }
  };

  const formatCurrency = (v?: number | null) =>
    v == null ? "—" : new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const getStatusColor = (estado: string) => {
    switch (estado) {
      case "PAGADO":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
      case "ENTREGADO":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400";
      case "PENDIENTE":
        return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
      case "PENDIENTE_MORA":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400";
      case "PENDIENTE_OROZCO":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400";
      case "PENDIENTE_RETENCION_CREDITO":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400";
      case "LICITACION_ENVIADA":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400";
      case "PRESUPUESTO_ENVIADO":
        return "bg-teal-100 text-teal-800 dark:bg-teal-900/20 dark:text-teal-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400";
    }
  };

  const shownCols = COLUMNS.filter((c) => visibleCols[c.key]);
  const colSpan = shownCols.length + 1; // +1 for Acciones

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
        <Link href="/budgets/new" className="flex-shrink-0">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Nuevo Presupuesto
          </Button>
        </Link>

        <Button
          type="button"
          variant="outline"
          className="gap-2 flex-shrink-0"
          onClick={syncEstimates}
          disabled={syncing}
        >
          {syncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Sincronizar presupuestos con Contasimple
        </Button>

        <div className="flex-1 relative min-w-[200px]">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por cliente, nombre o ciudad..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-10"
          />
        </div>

        <Select value={estado || "all"} onValueChange={(v) => { setEstado(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-full lg:w-44">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="PENDIENTE">Pendiente</SelectItem>
            <SelectItem value="PENDIENTE_MORA">Pendiente de Mora</SelectItem>
            <SelectItem value="PENDIENTE_OROZCO">Pendiente de Orozco</SelectItem>
            <SelectItem value="PENDIENTE_RETENCION_CREDITO">Pdte. Retención de Crédito</SelectItem>
            <SelectItem value="LICITACION_ENVIADA">Licitación Enviada</SelectItem>
            <SelectItem value="PRESUPUESTO_ENVIADO">Presupuesto Enviado</SelectItem>
            <SelectItem value="ENTREGADO">Entregado</SelectItem>
            <SelectItem value="PAGADO">Pagado</SelectItem>
          </SelectContent>
        </Select>

        <Select value={tipo || "all"} onValueChange={(v) => { setTipo(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-full lg:w-40">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="LICITACION">Licitación</SelectItem>
            <SelectItem value="CONTRATO_MENOR">Contrato Menor</SelectItem>
            <SelectItem value="OTRO">Otro</SelectItem>
            <SelectItem value="NORMAL">Normal</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sede || "all"} onValueChange={(v) => { setSede(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-full lg:w-40">
            <SelectValue placeholder="Sede" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las sedes</SelectItem>
            <SelectItem value="peninsula">Península</SelectItem>
            <SelectItem value="canarias">Canarias</SelectItem>
          </SelectContent>
        </Select>

        <Select value={comunidad || "all"} onValueChange={(v) => { setComunidad(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-full lg:w-48">
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

        <div className="w-full lg:w-56">
          <CustomerCombobox
            value={customerId}
            initialLabel={customerLabel}
            onChange={(id, label) => { setCustomerId(id); setCustomerLabel(label ?? null); setPage(1); }}
            placeholder="Filtrar por cliente…"
          />
        </div>

        <div className="w-full lg:w-44">
          <Input
            placeholder="N.º de presupuesto"
            value={numero}
            onChange={(e) => { setNumero(e.target.value); setPage(1); }}
          />
        </div>

        <Select value={anio || "all"} onValueChange={(v) => { setAnio(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-full lg:w-32">
            <SelectValue placeholder="Año" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los años</SelectItem>
            {YEARS.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={trimestre || "all"} onValueChange={(v) => { setTrimestre(v === "all" ? "" : v); setPage(1); }} disabled={!anio}>
          <SelectTrigger className="w-full lg:w-36">
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

        <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setPage(1); }}>
          <SelectTrigger className="w-full lg:w-52">
            <SelectValue placeholder="Ordenar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fecha_desc">Más reciente primero</SelectItem>
            <SelectItem value="fecha_asc">Más antiguo primero</SelectItem>
            <SelectItem value="total_desc">Importe: mayor a menor</SelectItem>
            <SelectItem value="total_asc">Importe: menor a mayor</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Desde</label>
            <Input type="date" value={fechaDesde} disabled={!!anio} onChange={(e) => { setFechaDesde(e.target.value); setPage(1); }} className="w-full lg:w-40" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Hasta</label>
            <Input type="date" value={fechaHasta} disabled={!!anio} onChange={(e) => { setFechaHasta(e.target.value); setPage(1); }} className="w-full lg:w-40" />
          </div>
        </div>

        {/* Column visibility */}
        <div className="relative">
          <Button type="button" variant="outline" className="gap-2" onClick={() => setShowColMenu((s) => !s)}>
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
      </div>

      {/* Vista mobile: tarjetas */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <Card><div className="text-center py-8 text-sm text-gray-500">Cargando...</div></Card>
        ) : budgets.length === 0 ? (
          <Card><div className="text-center py-8 text-sm text-gray-500">No se encontraron presupuestos</div></Card>
        ) : (
          budgets.map((budget) => {
            const s = sedeFromNumber(budget.contasimpleNumber);
            return (
              <Card key={budget.id} className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold break-words">{budget.cliente}</p>
                    {budget.nombre && <p className="text-xs text-gray-500 break-words">{budget.nombre}</p>}
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap flex-shrink-0 ${getStatusColor(budget.estado)}`}>
                    {budget.estado}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400 mb-3">
                  {budget.contasimpleNumber && <span className="font-mono">{budget.contasimpleNumber}</span>}
                  {s && (
                    <span className={`px-1.5 py-0.5 rounded font-medium ${s === "Canarias" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400" : "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400"}`}>{s}</span>
                  )}
                  {budget.ciudad && <span>{budget.ciudad}</span>}
                  {budget.fechaSolicitud && <span>{formatDate(budget.fechaSolicitud)}</span>}
                </div>
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
                  <div className="text-sm">
                    <span className="font-semibold tabular-nums">{formatCurrency(budget.totalConIva)}</span>
                    {budget.facturado && (
                      <span className="ml-2 inline-flex items-center gap-1 text-green-600 text-xs"><CheckCircle2 className="h-3.5 w-3.5" /> {budget.numeroFactura || "Facturado"}</span>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <Link href={`/budgets/${budget.id}`}>
                      <Button size="sm" variant="outline" className="h-9 w-9 p-0"><Eye className="h-4 w-4" /></Button>
                    </Link>
                    <Link href={`/budgets/${budget.id}/edit`}>
                      <Button size="sm" variant="outline" className="h-9 w-9 p-0"><Edit className="h-4 w-4" /></Button>
                    </Link>
                    <Button size="sm" variant="outline" className="h-9 w-9 p-0 text-red-600 hover:text-red-700" onClick={() => handleDeleteBudget(budget.id)}>
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      <Card className="hidden md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {shownCols.map((c) => (
                  <TableHead key={c.key} className={c.key === "comunidad" ? "hidden md:table-cell" : ""}>
                    {c.label}
                  </TableHead>
                ))}
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="text-center py-8">
                    Cargando...
                  </TableCell>
                </TableRow>
              ) : budgets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="text-center py-8">
                    No se encontraron presupuestos
                  </TableCell>
                </TableRow>
              ) : (
                budgets.map((budget) => (
                  <TableRow key={budget.id}>
                    {shownCols.map((c) => {
                      switch (c.key) {
                        case "numero":
                          return <TableCell key={c.key} className="text-sm font-medium whitespace-nowrap">{budget.contasimpleNumber || "—"}</TableCell>;
                        case "sede": {
                          const s = sedeFromNumber(budget.contasimpleNumber);
                          return (
                            <TableCell key={c.key} className="text-sm whitespace-nowrap">
                              {s ? (
                                <span className={`px-2 py-1 rounded text-xs font-medium ${s === "Canarias" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400" : "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400"}`}>
                                  {s}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </TableCell>
                          );
                        }
                        case "cliente":
                          return <TableCell key={c.key} className="font-medium">{budget.cliente}</TableCell>;
                        case "nombre":
                          return <TableCell key={c.key} className="text-sm">{budget.nombre || "—"}</TableCell>;
                        case "tipo":
                          return <TableCell key={c.key} className="text-sm">{budget.tipo === "OTRO" && budget.tipoCustom ? budget.tipoCustom : budget.tipo}</TableCell>;
                        case "comunidad":
                          return <TableCell key={c.key} className="text-sm hidden md:table-cell">{budget.comunidadAutonoma}</TableCell>;
                        case "ciudad":
                          return <TableCell key={c.key} className="text-sm">{budget.ciudad || "—"}</TableCell>;
                        case "fechaSolicitud":
                          return <TableCell key={c.key} className="text-sm">{budget.fechaSolicitud ? formatDate(budget.fechaSolicitud) : "—"}</TableCell>;
                        case "total":
                          return <TableCell key={c.key} className="text-sm whitespace-nowrap text-right tabular-nums">{formatCurrency(budget.totalConIva)}</TableCell>;
                        case "estado":
                          return (
                            <TableCell key={c.key}>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(budget.estado)}`}>
                                {budget.estado}
                              </span>
                            </TableCell>
                          );
                        case "facturado":
                          return (
                            <TableCell key={c.key} className="text-sm">
                              {budget.facturado ? (
                                <span className="inline-flex items-center gap-1 text-green-600"><CheckCircle2 className="h-4 w-4" /> {budget.numeroFactura || "Sí"}</span>
                              ) : (
                                <span className="text-gray-400">No</span>
                              )}
                            </TableCell>
                          );
                        default:
                          return null;
                      }
                    })}
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/budgets/${budget.id}`}>
                          <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Link href={`/budgets/${budget.id}/edit`}>
                          <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                          onClick={() => handleDeleteBudget(budget.id)}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Mostrando página {page} de {totalPages} ({total} total)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
