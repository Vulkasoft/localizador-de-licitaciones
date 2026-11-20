"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, AlertTriangle } from "lucide-react";

type Invoice = { id: string; company: string; numero: string; cliente: string; fecha: string; total: number; estado: string; conceptos: string };
type Result = { invoices: Invoice[]; errors: string[]; desde: string; hasta: string; sede: string };
const money = (value: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
const dateLabel = (value: string) => new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", dateStyle: "short" }).format(new Date(value));
const statusLabel = (value: string) => ({ payed: "Cobrada", paid: "Cobrada", pending: "Pendiente", unpaid: "Pendiente de cobro", partiallypayed: "Cobro parcial", cancelled: "Anulada" }[value.toLowerCase()] || value || "Sin estado");

export function IssuedInvoiceList({ currentYear }: { currentYear: number }) {
  const [desde, setDesde] = useState(`${currentYear}-01-01`);
  const [hasta, setHasta] = useState(`${currentYear}-12-31`);
  const [sede, setSede] = useState("all");
  const [year, setYear] = useState(String(currentYear));
  const [quarter, setQuarter] = useState("all");
  const [numero, setNumero] = useState("");
  const [cliente, setCliente] = useState("");
  const [concepto, setConcepto] = useState("");
  const [estado, setEstado] = useState("all");
  const [sort, setSort] = useState("fecha_desc");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(from: string, to: string, company: string, signal?: AbortSignal) {
    if (!from || !to || from > to) { setError("Indica fechas válidas: Desde no puede ser posterior a Hasta."); return; }
    setLoading(true); setError(null); setData(null); setPage(1);
    try {
      const params = new URLSearchParams({ desde: from, hasta: to, sede: company });
      const response = await fetch(`/api/facturacion/invoices?${params}`, { signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudieron cargar las facturas.");
      setData(result);
    } catch (e) {
      if (signal?.aborted) return;
      console.error("Error al consultar facturas", e);
      setError(e instanceof Error ? e.message : "Error de conexión.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    void load(`${currentYear}-01-01`, `${currentYear}-12-31`, "all", controller.signal);
    return () => controller.abort();
  }, [currentYear]);

  function preset(y: string, q: string) {
    setYear(y); setQuarter(q);
    const startMonth = q === "all" ? 0 : (Number(q) - 1) * 3;
    const endMonth = q === "all" ? 12 : startMonth + 3;
    setDesde(`${y}-${String(startMonth + 1).padStart(2, "0")}-01`);
    setHasta(new Date(Date.UTC(Number(y), endMonth, 0)).toISOString().slice(0, 10));
  }
  const filtered = useMemo(() => (data?.invoices || []).filter(invoice =>
    (!numero || (invoice.numero || "").toLowerCase().includes(numero.toLowerCase().trim())) &&
    (!cliente || (invoice.cliente || "").toLowerCase().includes(cliente.toLowerCase().trim())) &&
    (!concepto || invoice.conceptos.toLowerCase().includes(concepto.toLowerCase().trim())) &&
    (estado === "all" || invoice.estado === estado)
  ).sort((a, b) => {
    const delta = sort.startsWith("total") ? a.total - b.total : new Date(a.fecha).getTime() - new Date(b.fecha).getTime();
    return (sort.endsWith("desc") ? -delta : delta) || a.id.localeCompare(b.id);
  }), [data, numero, cliente, concepto, estado, sort]);
  useEffect(() => { setPage(1); }, [numero, cliente, concepto, estado, sort]);
  const states = Array.from(new Set((data?.invoices || []).map(i => i.estado).filter(Boolean))).sort();
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const visiblePage = Math.min(page, pages);
  const rows = filtered.slice((visiblePage - 1) * 20, visiblePage * 20);
  const pendingRange = data && (desde !== data.desde || hasta !== data.hasta || sede !== data.sede);

  return <div className="space-y-4">
    <Card className="p-4 space-y-4">
      <form onSubmit={e => { e.preventDefault(); void load(desde, hasta, sede); }} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div><label className="text-sm">Año</label><Select value={year} onValueChange={v => preset(v, quarter)}><SelectTrigger aria-label="Año"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: currentYear - 2019 }, (_, i) => String(currentYear - i)).map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select></div>
          <div><label className="text-sm">Trimestre</label><Select value={quarter} onValueChange={v => preset(year, v)}><SelectTrigger aria-label="Trimestre"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todo el año</SelectItem>{[1,2,3,4].map(q => <SelectItem key={q} value={String(q)}>{q}.º trimestre</SelectItem>)}</SelectContent></Select></div>
          <div><label htmlFor="invoice-from" className="text-sm">Desde</label><Input id="invoice-from" type="date" required min="2020-01-01" max={`${currentYear}-12-31`} value={desde} onChange={e => setDesde(e.target.value)} /></div>
          <div><label htmlFor="invoice-until" className="text-sm">Hasta</label><Input id="invoice-until" type="date" required min={desde || "2020-01-01"} max={`${currentYear}-12-31`} value={hasta} onChange={e => setHasta(e.target.value)} /></div>
          <div><label className="text-sm">Sede</label><Select value={sede} onValueChange={setSede}><SelectTrigger aria-label="Sede"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Canarias y Península</SelectItem><SelectItem value="canarias">Canarias</SelectItem><SelectItem value="peninsula">Península</SelectItem></SelectContent></Select></div>
        </div>
        <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Consultar facturas</Button><p className="text-xs text-muted-foreground">Las fechas corresponden a la emisión de la factura. Pulsa Consultar al cambiar fechas o sede.</p></div>
      </form>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input aria-label="Número de factura" placeholder="N.º de factura…" value={numero} onChange={e => setNumero(e.target.value)} />
        <Input aria-label="Cliente de la factura" placeholder="Cliente de la factura…" value={cliente} onChange={e => setCliente(e.target.value)} />
        <Input aria-label="Concepto de la factura" placeholder="Producto o concepto…" value={concepto} onChange={e => setConcepto(e.target.value)} />
        <Select value={estado} onValueChange={setEstado}><SelectTrigger aria-label="Estado de la factura"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los estados</SelectItem>{states.map(s => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}</SelectContent></Select>
        <Select value={sort} onValueChange={setSort}><SelectTrigger aria-label="Ordenar facturas"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fecha_desc">Más recientes primero</SelectItem><SelectItem value="fecha_asc">Más antiguas primero</SelectItem><SelectItem value="total_desc">Mayor importe primero</SelectItem><SelectItem value="total_asc">Menor importe primero</SelectItem></SelectContent></Select>
      </div>
      <Button variant="ghost" size="sm" onClick={() => { setNumero(""); setCliente(""); setConcepto(""); setEstado("all"); setSort("fecha_desc"); }}>Limpiar filtros de resultados</Button>
    </Card>
    {error && <Card role="alert" className="p-4 text-destructive">{error}</Card>}
    {pendingRange && <p role="status" className="text-sm text-muted-foreground">Hay cambios de fechas o sede pendientes de consultar. La tabla conserva el último intervalo consultado.</p>}
    {loading ? <Card className="flex justify-center items-center p-12"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Consultando facturas emitidas…</Card> : data && <>
      {data.errors.length > 0 && <Card role="alert" className="p-4"><AlertTriangle className="inline mr-2 h-4 w-4" />Resultados parciales. No se pudieron consultar: {data.errors.join(", ")}. Pulsa Consultar para reintentar.</Card>}
      <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground"><span>{filtered.length} factura(s) · {dateLabel(data.desde)} – {dateLabel(data.hasta)}</span><span>Total {data.errors.length ? "parcial " : ""}filtrado: {money(filtered.reduce((sum, invoice) => sum + invoice.total, 0))}</span></div>
      <Card className="overflow-hidden"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>N.º Factura</TableHead><TableHead>Cliente</TableHead><TableHead>Sede</TableHead><TableHead>Fecha factura</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader><TableBody>
        {!rows.length && <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No hay facturas que coincidan con los filtros.</TableCell></TableRow>}
        {rows.map(invoice => <TableRow key={invoice.id}><TableCell className="font-medium whitespace-nowrap">{invoice.numero || "—"}</TableCell><TableCell>{invoice.cliente || "—"}</TableCell><TableCell><Badge variant="outline">{invoice.company === "canarias" ? "Canarias" : "Península"}</Badge></TableCell><TableCell className="whitespace-nowrap">{dateLabel(invoice.fecha)}</TableCell><TableCell>{statusLabel(invoice.estado)}</TableCell><TableCell className="text-right whitespace-nowrap">{money(invoice.total)}</TableCell></TableRow>)}
      </TableBody></Table></div></Card>
      <div className="flex items-center justify-between gap-3"><Button variant="outline" disabled={visiblePage <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button><span className="text-sm">Página {visiblePage} de {pages}</span><Button variant="outline" disabled={visiblePage >= pages} onClick={() => setPage(p => p + 1)}>Siguiente</Button></div>
    </>}
  </div>;
}
