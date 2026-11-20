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
  Landmark,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
} from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { toast } from "sonner";
import { RC_STATUSES, RC_STATUS_LABELS, RC_STATUS_BADGE } from "@/lib/rc-utils";

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

function formatImporte(v?: number | null) {
  if (v == null) return "—";
  return v.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

interface Rc {
  id: string;
  organismo?: string | null;
  expediente?: string | null;
  referencia?: string | null;
  importe?: number | null;
  fechaSolicitud?: string | null;
  fechaConcesion?: string | null;
  numeroRC?: string | null;
  estado: string;
  descripcion?: string | null;
  createdAt: string;
}

function StatusBadge({ estado }: { estado: string }) {
  return (
    <span
      className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${
        RC_STATUS_BADGE[estado] ?? RC_STATUS_BADGE.PENDIENTE
      }`}
    >
      {RC_STATUS_LABELS[estado] ?? estado}
    </span>
  );
}

export function RcList() {
  const [items, setItems] = useState<Rc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<string>("PENDIENTE");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 400);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("query", debouncedSearch);
      if (estado !== "ALL") params.set("estado", estado);
      params.set("page", String(page));
      params.set("pageSize", "20");
      const res = await fetch(`/api/credit-retentions?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.items ?? []);
      setTotalPages(data.totalPages ?? 1);
      setTotal(data.total ?? 0);
    } catch {
      toast.error("Error al cargar las retenciones de crédito");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, estado, page]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, estado]);

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta retención de crédito? Esta acción no se puede deshacer."))
      return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/credit-retentions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Retención eliminada");
      setItems((prev) => prev.filter((o) => o.id !== id));
    } catch {
      toast.error("Error al eliminar la retención");
    } finally {
      setDeletingId(null);
    }
  };

  const handleQuickStatus = async (id: string, nuevoEstado: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/credit-retentions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Estado: ${RC_STATUS_LABELS[nuevoEstado]}`);
      // If the filter would hide the item now, remove it from the list; else update in place
      if (estado !== "ALL" && estado !== nuevoEstado) {
        setItems((prev) => prev.filter((o) => o.id !== id));
      } else {
        setItems((prev) =>
          prev.map((o) => (o.id === id ? { ...o, estado: nuevoEstado } : o))
        );
      }
    } catch {
      toast.error("Error al actualizar el estado");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Landmark className="w-7 h-7 text-sky-500" />
            Pendiente de RC
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Seguimiento de retenciones de crédito de las administraciones · {total}{" "}
            {total === 1 ? "registro" : "registros"}
          </p>
        </div>
        <Link href="/rc/new">
          <Button className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Nueva RC
          </Button>
        </Link>
      </div>

      <Card className="p-4 mb-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por organismo, expediente, presupuesto, nº RC..."
              className="pl-9"
            />
          </div>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los estados</SelectItem>
              {RC_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {RC_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Cargando retenciones...
        </div>
      ) : items.length === 0 ? (
        <Card className="p-12 text-center">
          <Landmark className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            No hay retenciones de crédito que coincidan con la búsqueda.
          </p>
          <Link href="/rc/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Registrar la primera RC
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
                    <TableHead>Organismo</TableHead>
                    <TableHead>Expediente</TableHead>
                    <TableHead>Presup./Factura</TableHead>
                    <TableHead>Nº RC</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                    <TableHead>Solicitud</TableHead>
                    <TableHead>Concesión</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium max-w-[200px] truncate" title={o.organismo || ""}>
                        {o.organismo || "—"}
                      </TableCell>
                      <TableCell>{o.expediente || "—"}</TableCell>
                      <TableCell className="text-sky-700 dark:text-sky-400">
                        {o.referencia || "—"}
                      </TableCell>
                      <TableCell>{o.numeroRC || "—"}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {formatImporte(o.importe)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(o.fechaSolicitud)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(o.fechaConcesion)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge estado={o.estado} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {o.estado === "PENDIENTE" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
                              title="Marcar RC concedida"
                              onClick={() => handleQuickStatus(o.id, "CONCEDIDA")}
                              disabled={updatingId === o.id}
                            >
                              {updatingId === o.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Landmark className="w-4 h-4" />
                              )}
                            </Button>
                          )}
                          {o.estado === "CONCEDIDA" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-sky-600 hover:text-sky-700"
                              title="Marcar pedido realizado"
                              onClick={() => handleQuickStatus(o.id, "PEDIDO_REALIZADO")}
                              disabled={updatingId === o.id}
                            >
                              {updatingId === o.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <ShoppingCart className="w-4 h-4" />
                              )}
                            </Button>
                          )}
                          <Link href={`/rc/${o.id}/edit`}>
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
                      {o.organismo || "Organismo sin especificar"}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {o.expediente || "Sin expediente"}
                    </p>
                  </div>
                  <StatusBadge estado={o.estado} />
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
                  {o.referencia && (
                    <div className="truncate">
                      <span className="text-gray-400">Presup./Fra:</span> {o.referencia}
                    </div>
                  )}
                  {o.numeroRC && (
                    <div className="truncate">
                      <span className="text-gray-400">Nº RC:</span> {o.numeroRC}
                    </div>
                  )}
                  <div>
                    <span className="text-gray-400">Importe:</span>{" "}
                    {formatImporte(o.importe)}
                  </div>
                  {o.fechaSolicitud && (
                    <div>
                      <span className="text-gray-400">Solicitud:</span>{" "}
                      {formatDate(o.fechaSolicitud)}
                    </div>
                  )}
                  {o.fechaConcesion && (
                    <div>
                      <span className="text-gray-400">Concesión:</span>{" "}
                      {formatDate(o.fechaConcesion)}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <div className="flex items-center gap-2">
                    {o.estado === "PENDIENTE" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickStatus(o.id, "CONCEDIDA")}
                        disabled={updatingId === o.id}
                      >
                        {updatingId === o.id ? (
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        ) : (
                          <Landmark className="w-4 h-4 mr-1" />
                        )}
                        RC concedida
                      </Button>
                    )}
                    {o.estado === "CONCEDIDA" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickStatus(o.id, "PEDIDO_REALIZADO")}
                        disabled={updatingId === o.id}
                      >
                        {updatingId === o.id ? (
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        ) : (
                          <ShoppingCart className="w-4 h-4 mr-1" />
                        )}
                        Pedido hecho
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/rc/${o.id}/edit`}>
                      <Button variant="ghost" size="sm">
                        <Edit className="w-4 h-4 mr-1" /> Editar
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
