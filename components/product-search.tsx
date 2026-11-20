"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Loader2,
  FileSpreadsheet,
  BadgeEuro,
  ExternalLink,
  AlertTriangle,
  PackageSearch,
  CalendarRange,
  X,
} from "lucide-react";

interface LineMatch {
  concept: string;
  quantity: number | null;
}

interface Presupuesto {
  id: string;
  numero: string | null;
  sede: "Canarias" | "Península" | null;
  cliente: string | null;
  nombre: string | null;
  total: number | null;
  estado: string;
  estadoContasimple: string | null;
  facturado: boolean;
  numeroFactura: string | null;
  fechaFactura: string | null;
  fecha: string | null;
  lineas: LineMatch[];
}

interface Factura {
  id: number;
  numero: string | null;
  sede: "Canarias" | "Península" | null;
  cliente: string | null;
  fecha: string | null;
  periodo: string | null;
  total: number | null;
  estado: string | null;
  lineas: LineMatch[];
}

interface SearchResponse {
  query: string;
  years: number[];
  presupuestos: Presupuesto[];
  facturas: Factura[];
  presupuestosError: string | null;
  facturaErrors: Record<string, string> | null;
  counts: { presupuestos: number; facturas: number };
}

function formatCurrency(value?: number | null): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(d);
}

function SedeBadge({ sede }: { sede: "Canarias" | "Península" | null }) {
  if (!sede) return <span className="text-gray-400">—</span>;
  const isCan = sede === "Canarias";
  return (
    <Badge
      variant="outline"
      className={
        isCan
          ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
          : "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-300"
      }
    >
      {sede}
    </Badge>
  );
}

function LineChips({ lineas }: { lineas: LineMatch[] }) {
  return (
    <div className="flex flex-col gap-1">
      {lineas.map((l, i) => (
        <span key={i} className="text-xs text-gray-600 dark:text-gray-400">
          {l.quantity ? <span className="font-medium text-gray-800 dark:text-gray-200">{l.quantity}× </span> : null}
          {l.concept}
        </span>
      ))}
    </div>
  );
}

const YEAR_OPTIONS = [
  { value: "recent2", label: "Este año y el anterior" },
  { value: "recent3", label: "Últimos 3 años" },
  { value: "all", label: "Todos los años (desde 2020)" },
];

function yearsForOption(opt: string): number[] {
  const cy = new Date().getFullYear();
  if (opt === "recent3") return [cy, cy - 1, cy - 2];
  if (opt === "all") {
    const out: number[] = [];
    for (let y = cy; y >= 2020; y--) out.push(y);
    return out;
  }
  return [cy, cy - 1];
}

export function ProductSearch() {
  const [query, setQuery] = useState("");
  const [yearOpt, setYearOpt] = useState("recent2");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Result filters (applied client-side over already-fetched data)
  const [tipo, setTipo] = useState<"todos" | "presupuestos" | "facturas">("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  function inDateRange(value?: string | null): boolean {
    if (!desde && !hasta) return true;
    if (!value) return false;
    const t = new Date(value).getTime();
    if (Number.isNaN(t)) return false;
    if (desde) {
      const d = new Date(desde + "T00:00:00").getTime();
      if (t < d) return false;
    }
    if (hasta) {
      const h = new Date(hasta + "T23:59:59").getTime();
      if (t > h) return false;
    }
    return true;
  }

  const filteredPresupuestos = useMemo(
    () => (data ? data.presupuestos.filter((p) => inDateRange(p.fecha)) : []),
    [data, desde, hasta]
  );
  const filteredFacturas = useMemo(
    () => (data ? data.facturas.filter((f) => inDateRange(f.fecha)) : []),
    [data, desde, hasta]
  );
  const showPresupuestos = tipo === "todos" || tipo === "presupuestos";
  const showFacturas = tipo === "todos" || tipo === "facturas";
  const hasDateFilter = Boolean(desde || hasta);

  async function runSearch() {
    const q = query.trim();
    if (q.length < 2) {
      setError("Introduce al menos 2 caracteres.");
      return;
    }
    setError(null);
    setLoading(true);
    setData(null);
    try {
      const years = yearsForOption(yearOpt).join(",");
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}&years=${years}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || "Error en la búsqueda.");
      } else {
        setData(json);
      }
    } catch (e: any) {
      setError(e?.message || "Error de conexión.");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") runSearch();
  }

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Nombre del producto, referencia (SKU) o concepto…"
              className="pl-9"
            />
          </div>
          <div className="sm:w-56">
            <Select value={yearOpt} onValueChange={setYearOpt}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEAR_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={runSearch} disabled={loading} className="sm:w-32">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Search className="mr-2 h-4 w-4" /> Buscar</>}
          </Button>
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Los presupuestos se buscan en toda la base de datos. Las facturas se consultan en Contasimple para el periodo seleccionado (ampl­a el rango si no encuentras una factura antigua).
        </p>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        </Card>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 className="mr-3 h-6 w-6 animate-spin" />
          Buscando en presupuestos y facturas…
        </div>
      )}

      {data && !loading && (
        <div className="space-y-8">
          {/* Summary */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
            <PackageSearch className="h-5 w-5 text-sky-500" />
            <span>
              Resultados para <span className="font-semibold text-gray-900 dark:text-white">“{data.query}”</span>:
            </span>
            <Badge variant="secondary">{filteredPresupuestos.length} presupuesto(s)</Badge>
            <Badge variant="secondary">{filteredFacturas.length} factura(s)</Badge>
          </div>

          {/* Result filters: tipo + fechas */}
          <Card className="p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Mostrar</p>
                <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800">
                  {([
                    { key: "todos", label: "Todos" },
                    { key: "presupuestos", label: "Presupuestos" },
                    { key: "facturas", label: "Facturas" },
                  ] as const).map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => setTipo(o.key)}
                      className={
                        "rounded-md px-4 py-1.5 text-sm font-medium transition-colors " +
                        (tipo === o.key
                          ? "bg-white text-sky-700 shadow-sm dark:bg-gray-900 dark:text-sky-300"
                          : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200")
                      }
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="flex items-center gap-2 text-gray-500">
                  <CalendarRange className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">Fechas</span>
                </div>
                <div className="flex flex-col">
                  <label className="mb-1 text-xs text-gray-500 dark:text-gray-400">Desde</label>
                  <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" />
                </div>
                <div className="flex flex-col">
                  <label className="mb-1 text-xs text-gray-500 dark:text-gray-400">Hasta</label>
                  <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" />
                </div>
                {hasDateFilter && (
                  <Button variant="outline" size="sm" onClick={() => { setDesde(""); setHasta(""); }}>
                    <X className="mr-1 h-4 w-4" /> Limpiar
                  </Button>
                )}
              </div>
            </div>
            {hasDateFilter && (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                Filtrando por fecha del presupuesto/factura. Las facturas se buscan en Contasimple según el rango de años elegido arriba; usa “Desde/Hasta” para acotar dentro de ese rango.
              </p>
            )}
          </Card>

          {data.facturaErrors && (
            <Card className="border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
              <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div className="text-xs">
                  No se pudieron consultar algunas facturas en Contasimple:{" "}
                  {Object.entries(data.facturaErrors).map(([k, v]) => (
                    <span key={k} className="mr-2">
                      <strong>{k}</strong> ({v})
                    </span>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Presupuestos */}
          {showPresupuestos && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Presupuestos</h2>
              <Badge variant="secondary">{filteredPresupuestos.length}</Badge>
            </div>
            {filteredPresupuestos.length === 0 ? (
              <Card className="p-6 text-sm text-gray-500 dark:text-gray-400">
                {hasDateFilter ? "No hay presupuestos en el rango de fechas seleccionado." : "No se encontró el producto en ningún presupuesto."}
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sede</TableHead>
                        <TableHead>N.º Presupuesto</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Líneas coincidentes</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Facturado</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPresupuestos.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell><SedeBadge sede={p.sede} /></TableCell>
                          <TableCell className="font-medium whitespace-nowrap">{p.numero || "—"}</TableCell>
                          <TableCell className="max-w-[220px] truncate" title={p.cliente || ""}>{p.cliente || "—"}</TableCell>
                          <TableCell className="max-w-[360px]"><LineChips lineas={p.lineas} /></TableCell>
                          <TableCell className="text-right whitespace-nowrap">{formatCurrency(p.total)}</TableCell>
                          <TableCell>
                            {p.facturado ? (
                              <div className="flex flex-col">
                                <Badge className="w-fit bg-emerald-600 hover:bg-emerald-600">Sí</Badge>
                                {p.numeroFactura && <span className="mt-1 text-xs text-gray-500">{p.numeroFactura}</span>}
                              </div>
                            ) : (
                              <Badge variant="outline" className="text-gray-500">No</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Link href={`/budgets/${p.id}`} className="text-sky-600 hover:text-sky-700" title="Abrir presupuesto">
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
          </section>
          )}

          {/* Facturas */}
          {showFacturas && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <BadgeEuro className="h-5 w-5 text-sky-600" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Facturas</h2>
              <Badge variant="secondary">{filteredFacturas.length}</Badge>
            </div>
            {filteredFacturas.length === 0 ? (
              <Card className="p-6 text-sm text-gray-500 dark:text-gray-400">
                {hasDateFilter ? "No hay facturas en el rango de fechas seleccionado." : "No se encontró el producto en ninguna factura del periodo seleccionado."}
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sede</TableHead>
                        <TableHead>N.º Factura</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Líneas coincidentes</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredFacturas.map((f) => (
                        <TableRow key={`${f.sede}-${f.id}`}>
                          <TableCell><SedeBadge sede={f.sede} /></TableCell>
                          <TableCell className="font-medium whitespace-nowrap">{f.numero || "—"}</TableCell>
                          <TableCell className="max-w-[220px] truncate" title={f.cliente || ""}>{f.cliente || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatDate(f.fecha)}</TableCell>
                          <TableCell className="max-w-[360px]"><LineChips lineas={f.lineas} /></TableCell>
                          <TableCell className="text-right whitespace-nowrap">{formatCurrency(f.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
          </section>
          )}
        </div>
      )}
    </div>
  );
}
