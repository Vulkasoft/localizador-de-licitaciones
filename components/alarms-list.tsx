"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Bell,
  Plus,
  Edit,
  Trash2,
  Calendar,
  Mail,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  PlayCircle,
  Loader2,
} from "lucide-react";
import Link from "next/link";

interface AlarmFile {
  id: string;
  filename: string;
}

interface Alarm {
  id: string;
  titulo: string;
  descripcion: string | null;
  fechaLimite: string;
  diasAntelacion: number;
  emailsDestino: string;
  documentos: string | null;
  estado: string;
  enviada: boolean;
  fechaEnvio: string | null;
  createdAt: string;
  user: { name: string | null; email: string };
  budget: { id: string; nombre: string | null; cliente: string | null; tipo: string } | null;
  tender: { id: string; title: string } | null;
  alarmFiles: AlarmFile[];
}

export function AlarmsList() {
  const router = useRouter();
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ACTIVA");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const fetchAlarms = async () => {
    try {
      const res = await fetch(`/api/alarms?estado=${filter}&limit=100`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAlarms(data.alarms);
    } catch {
      toast.error("Error al cargar alarmas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchAlarms();
  }, [filter]);

  const handleDelete = async (id: string) => {
    if (!confirm("¿Seguro que desea eliminar esta alarma?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/alarms/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setAlarms((prev) => prev.filter((a) => a.id !== id));
      toast.success("Alarma eliminada");
    } catch {
      toast.error("Error al eliminar");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      const res = await fetch(`/api/alarms/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: "CANCELADA" }),
      });
      if (!res.ok) throw new Error();
      fetchAlarms();
      toast.success("Alarma cancelada");
    } catch {
      toast.error("Error al cancelar");
    }
  };

  const handleReactivate = async (id: string) => {
    try {
      const res = await fetch(`/api/alarms/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: "ACTIVA" }),
      });
      if (!res.ok) throw new Error();
      fetchAlarms();
      toast.success("Alarma reactivada");
    } catch {
      toast.error("Error al reactivar");
    }
  };

  const handleTestSend = async (id: string) => {
    setTestingId(id);
    try {
      const res = await fetch(`/api/alarms/${id}/test`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.error || data.message || "Error al enviar prueba");
      }
    } catch {
      toast.error("Error al enviar correo de prueba");
    } finally {
      setTestingId(null);
    }
  };

  const getStatusConfig = (estado: string) => {
    switch (estado) {
      case "ACTIVA":
        return {
          label: "Activa",
          color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
          icon: Clock,
        };
      case "ENVIADA":
        return {
          label: "Enviada",
          color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
          icon: Send,
        };
      case "VENCIDA":
        return {
          label: "Vencida",
          color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
          icon: AlertTriangle,
        };
      case "CANCELADA":
        return {
          label: "Cancelada",
          color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
          icon: XCircle,
        };
      default:
        return {
          label: estado,
          color: "bg-gray-100 text-gray-800",
          icon: Bell,
        };
    }
  };

  const getDaysRemaining = (fechaLimite: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadline = new Date(fechaLimite);
    deadline.setHours(0, 0, 0, 0);
    const diff = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const getDaysColor = (days: number) => {
    if (days <= 0) return "text-red-600 dark:text-red-400 font-bold";
    if (days <= 1) return "text-orange-600 dark:text-orange-400 font-semibold";
    if (days <= 3) return "text-amber-600 dark:text-amber-400";
    return "text-gray-600 dark:text-gray-400";
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Bell className="h-7 w-7 sm:h-8 sm:w-8 text-orange-500 flex-shrink-0" />
            Alarmas
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gestiona las alertas de fechas límite
          </p>
        </div>
        <Link href="/alarms/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nueva Alarma
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {["ACTIVA", "ENVIADA", "VENCIDA", "CANCELADA", "TODAS"].map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === "TODAS" ? "Todas" : getStatusConfig(f).label}
          </Button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : alarms.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="h-12 w-12 text-gray-300 mb-4" />
            <p className="text-gray-500 dark:text-gray-400 text-lg">
              No hay alarmas {filter !== "TODAS" ? `con estado "${getStatusConfig(filter).label}"` : ""}
            </p>
            <Link href="/alarms/new" className="mt-4">
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Crear primera alarma
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {alarms.map((alarm) => {
            const status = getStatusConfig(alarm.estado);
            const StatusIcon = status.icon;
            const daysRemaining = getDaysRemaining(alarm.fechaLimite);

            return (
              <Card key={alarm.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex flex-col sm:flex-row">
                    {/* Status strip */}
                    <div
                      className={`w-full sm:w-2 min-h-[4px] sm:min-h-0 ${
                        alarm.estado === "ACTIVA"
                          ? "bg-green-500"
                          : alarm.estado === "ENVIADA"
                          ? "bg-blue-500"
                          : alarm.estado === "VENCIDA"
                          ? "bg-red-500"
                          : "bg-gray-400"
                      }`}
                    />

                    <div className="flex-1 p-4 sm:p-5">
                      <div className="flex flex-col sm:flex-row justify-between gap-3">
                        <div className="flex-1">
                          {/* Title + Status */}
                          <div className="flex items-start gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                              {alarm.titulo}
                            </h3>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${status.color}`}
                            >
                              <StatusIcon className="h-3 w-3" />
                              {status.label}
                            </span>
                          </div>

                          {/* Description */}
                          {alarm.descripcion && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                              {alarm.descripcion}
                            </p>
                          )}

                          {/* Info row */}
                          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-4 w-4 text-gray-400" />
                              <span className="text-gray-600 dark:text-gray-400">
                                {new Date(alarm.fechaLimite).toLocaleDateString("es-ES", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  timeZone: "UTC",
                                })}
                              </span>
                              {alarm.estado === "ACTIVA" && (
                                <span className={`ml-1 ${getDaysColor(daysRemaining)}`}>
                                  ({daysRemaining <= 0
                                    ? "¡Vencida!"
                                    : daysRemaining === 1
                                    ? "¡Mañana!"
                                    : `${daysRemaining} días`})
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Mail className="h-4 w-4 text-gray-400" />
                              <span className="text-gray-600 dark:text-gray-400 truncate max-w-[200px]">
                                {alarm.emailsDestino}
                              </span>
                            </div>
                            {alarm.alarmFiles.length > 0 && (
                              <div className="flex items-center gap-1.5">
                                <FileText className="h-4 w-4 text-gray-400" />
                                <span className="text-gray-600 dark:text-gray-400">
                                  {alarm.alarmFiles.length} archivo{alarm.alarmFiles.length > 1 ? "s" : ""}
                                </span>
                              </div>
                            )}
                            {alarm.budget && (
                              <div className="flex items-center gap-1.5">
                                <FileText className="h-4 w-4 text-blue-400" />
                                <Link
                                  href={`/budgets/${alarm.budget.id}`}
                                  className="text-blue-600 hover:underline"
                                >
                                  {alarm.budget.nombre || alarm.budget.cliente || "Presupuesto"}
                                </Link>
                              </div>
                            )}
                            {alarm.tender && (
                              <div className="flex items-center gap-1.5">
                                <FileText className="h-4 w-4 text-sky-400" />
                                <Link
                                  href={`/tenders/${alarm.tender.id}`}
                                  className="text-sky-600 hover:underline truncate max-w-[220px]"
                                >
                                  {alarm.tender.title || "Licitación"}
                                </Link>
                              </div>
                            )}
                          </div>

                          {/* Sent info */}
                          {alarm.enviada && alarm.fechaEnvio && (
                            <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Enviada el{" "}
                              {new Date(alarm.fechaEnvio).toLocaleDateString("es-ES", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                timeZone: "UTC",
                              })}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex sm:flex-col gap-2 sm:items-end">
                          <Link href={`/alarms/${alarm.id}/edit`}>
                            <Button variant="outline" size="sm">
                              <Edit className="mr-1 h-3.5 w-3.5" />
                              Editar
                            </Button>
                          </Link>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleTestSend(alarm.id)}
                            disabled={testingId === alarm.id}
                            className="text-indigo-600 hover:text-indigo-700"
                          >
                            {testingId === alarm.id ? (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <PlayCircle className="mr-1 h-3.5 w-3.5" />
                            )}
                            {testingId === alarm.id ? "Enviando..." : "Probar"}
                          </Button>
                          {alarm.estado === "ACTIVA" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCancel(alarm.id)}
                              className="text-orange-600 hover:text-orange-700"
                            >
                              <XCircle className="mr-1 h-3.5 w-3.5" />
                              Cancelar
                            </Button>
                          )}
                          {(alarm.estado === "CANCELADA" || alarm.estado === "ENVIADA") && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReactivate(alarm.id)}
                              className="text-green-600 hover:text-green-700"
                            >
                              <Clock className="mr-1 h-3.5 w-3.5" />
                              Reactivar
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(alarm.id)}
                            disabled={deletingId === alarm.id}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Eliminar
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
