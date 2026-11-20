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
  Package,
  Paperclip,
  ChevronLeft,
  ChevronRight,
  Link2 as LinkIcon,
} from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { toast } from "sonner";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_BADGE,
} from "@/lib/order-utils";

function formatDate(dateString: string) {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface OrderFile {
  id: string;
  filename: string;
  tipo: string;
}
interface Order {
  id: string;
  numeroAcopio?: string | null;
  numeroPedido?: string | null;
  numeroSeguimiento?: string | null;
  referencia?: string | null;
  referenciaTipo?: string | null;
  budgetId?: string | null;
  empresa?: string | null;
  origen?: string | null;
  quienPidio?: string | null;
  fechaSolicitud?: string | null;
  estado: string;
  descripcion?: string | null;
  files: OrderFile[];
  createdAt: string;
}

function StatusBadge({ estado }: { estado: string }) {
  return (
    <span
      className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${
        ORDER_STATUS_BADGE[estado] ?? ORDER_STATUS_BADGE.SOLICITADO
      }`}
    >
      {ORDER_STATUS_LABELS[estado] ?? estado}
    </span>
  );
}

export function OrdersList() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 400);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("query", debouncedSearch);
      if (estado !== "ALL") params.set("estado", estado);
      params.set("page", String(page));
      params.set("pageSize", "20");
      const res = await fetch(`/api/orders?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setOrders(data.orders ?? []);
      setTotalPages(data.totalPages ?? 1);
      setTotal(data.total ?? 0);
    } catch {
      toast.error("Error al cargar los pedidos");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, estado, page]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, estado]);

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este pedido y sus documentos? Esta acción no se puede deshacer."))
      return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/orders/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Pedido eliminado");
      setOrders((prev) => prev.filter((o) => o.id !== id));
    } catch {
      toast.error("Error al eliminar el pedido");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Package className="w-7 h-7 text-sky-500" />
            Seguimiento de Pedidos
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {total} {total === 1 ? "pedido" : "pedidos"} registrados
          </p>
        </div>
        <Link href="/orders/new">
          <Button className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Nuevo pedido
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
              placeholder="Buscar por acopio, pedido, tracking, presupuesto/factura, empresa..."
              className="pl-9"
            />
          </div>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los estados</SelectItem>
              {ORDER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {ORDER_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Cargando pedidos...
        </div>
      ) : orders.length === 0 ? (
        <Card className="p-12 text-center">
          <Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            No hay pedidos que coincidan con la búsqueda.
          </p>
          <Link href="/orders/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Crear el primer pedido
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
                    <TableHead>Acopio</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Presup./Factura</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Tracking</TableHead>
                    <TableHead>Solicitado por</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Docs</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">
                        {o.numeroAcopio || "—"}
                      </TableCell>
                      <TableCell>{o.numeroPedido || "—"}</TableCell>
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
                      <TableCell>{o.empresa || "—"}</TableCell>
                      <TableCell>{o.origen || "—"}</TableCell>
                      <TableCell className="max-w-[160px] truncate" title={o.numeroSeguimiento || ""}>
                        {o.numeroSeguimiento || "—"}
                      </TableCell>
                      <TableCell>{o.quienPidio || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {o.fechaSolicitud ? formatDate(o.fechaSolicitud) : "—"}
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
                          <Link href={`/orders/${o.id}/edit`}>
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
            {orders.map((o) => (
              <Card key={o.id} className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white truncate">
                      {o.numeroAcopio || o.numeroPedido || "Pedido sin número"}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {o.empresa || "Sin empresa"}
                      {o.origen ? ` · ${o.origen}` : ""}
                    </p>
                  </div>
                  <StatusBadge estado={o.estado} />
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
                  {o.numeroPedido && (
                    <div>
                      <span className="text-gray-400">Pedido:</span> {o.numeroPedido}
                    </div>
                  )}
                  {o.referencia && (
                    <div className="truncate">
                      <span className="text-gray-400">Presup./Fra:</span>{" "}
                      {o.budgetId ? (
                        <Link
                          href={`/budgets/${o.budgetId}`}
                          className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-400 hover:underline"
                        >
                          <LinkIcon className="h-3 w-3" />
                          {o.referencia}
                        </Link>
                      ) : (
                        o.referencia
                      )}
                    </div>
                  )}
                  {o.numeroSeguimiento && (
                    <div className="truncate">
                      <span className="text-gray-400">Tracking:</span>{" "}
                      {o.numeroSeguimiento}
                    </div>
                  )}
                  {o.quienPidio && (
                    <div>
                      <span className="text-gray-400">Por:</span> {o.quienPidio}
                    </div>
                  )}
                  {o.fechaSolicitud && (
                    <div>
                      <span className="text-gray-400">Fecha:</span>{" "}
                      {formatDate(o.fechaSolicitud)}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400 text-sm">
                    <Paperclip className="w-3.5 h-3.5" />
                    {o.files.length} doc{o.files.length === 1 ? "" : "s"}
                  </span>
                  <div className="flex items-center gap-2">
                    <Link href={`/orders/${o.id}/edit`}>
                      <Button variant="outline" size="sm">
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
