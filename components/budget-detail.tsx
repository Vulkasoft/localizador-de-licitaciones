"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileUpload } from "@/components/file-upload";
import { NotesSection } from "@/components/notes-section";
import { BudgetLinesEditor } from "@/components/budget-lines-editor";
import { BudgetExpenses } from "@/components/budget-expenses";
import { ArrowLeft, Edit, Trash, History, Plus, Pencil, FileUp, FileX } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface BudgetDetailProps {
  budget: any;
}

export function BudgetDetail({ budget: initialBudget }: BudgetDetailProps) {
  const router = useRouter();
  const [budget, setBudget] = useState(initialBudget);
  const [loading, setLoading] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteScope, setDeleteScope] = useState<"app" | "contasimple" | "both">("app");
  const hasContasimple = !!budget.contasimpleId;

  const handleDelete = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/budgets/${budget.id}?scope=${deleteScope}`, {
        method: "DELETE",
      });
      const d = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(d?.error || "Error al eliminar");
        setLoading(false);
        return;
      }
      if (deleteScope === "contasimple") {
        toast.success("Presupuesto eliminado en Contasimple");
        setShowDelete(false);
        setLoading(false);
        router.refresh();
        return;
      }
      toast.success(deleteScope === "both" ? "Presupuesto eliminado en la aplicación y en Contasimple" : "Presupuesto eliminado");
      router.push("/budgets");
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Error al eliminar");
      setLoading(false);
    }
  };

  const handleFilesChange = async () => {
    const response = await fetch(`/api/budgets/${budget.id}`);
    const updatedBudget = await response.json();
    setBudget(updatedBudget);
  };

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
        return "";
    }
  };

  return (
    <>
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/budgets">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </Link>
      </div>

      <Card className="relative p-6">
        <div className="absolute top-3 right-3 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md">
          Creado: {new Date(budget.createdAt).toLocaleString("es-ES", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
        <div className="flex items-start justify-between mb-6 mt-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {budget.cliente}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {budget.nombre}
            </p>
          </div>
          <div className="flex gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2">
                  <History className="h-4 w-4" />
                  <span className="hidden sm:inline">Historial</span>
                  <span className="text-xs text-gray-500">({budget.auditLogs?.length ?? 0})</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <History className="h-5 w-5 text-blue-600" />
                    Historial de cambios
                  </DialogTitle>
                </DialogHeader>
                {(!budget.auditLogs || budget.auditLogs.length === 0) ? (
                  <p className="text-sm text-gray-500 py-4">Sin actividad registrada.</p>
                ) : (
                  <ol className="relative border-l border-gray-200 dark:border-gray-700 ml-2 space-y-4 mt-2">
                    {budget.auditLogs.map((log: any) => {
                      const iconFor = (a: string) => {
                        if (a === "CREATE") return <Plus className="h-3 w-3 text-white" />;
                        if (a === "UPDATE") return <Pencil className="h-3 w-3 text-white" />;
                        if (a === "FILE_UPLOAD") return <FileUp className="h-3 w-3 text-white" />;
                        if (a === "FILE_DELETE") return <FileX className="h-3 w-3 text-white" />;
                        return <History className="h-3 w-3 text-white" />;
                      };
                      const colorFor = (a: string) => {
                        if (a === "CREATE") return "bg-green-600";
                        if (a === "UPDATE") return "bg-blue-600";
                        if (a === "FILE_UPLOAD") return "bg-purple-600";
                        if (a === "FILE_DELETE") return "bg-red-600";
                        return "bg-gray-600";
                      };
                      const labelFor = (a: string) => {
                        if (a === "CREATE") return "Creado";
                        if (a === "UPDATE") return "Modificado";
                        if (a === "FILE_UPLOAD") return "Archivo subido";
                        if (a === "FILE_DELETE") return "Archivo eliminado";
                        return a;
                      };
                      return (
                        <li key={log.id} className="ml-6">
                          <span className={`absolute -left-3 flex items-center justify-center w-6 h-6 rounded-full ${colorFor(log.accion)} ring-4 ring-white dark:ring-gray-900`}>
                            {iconFor(log.accion)}
                          </span>
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="text-sm font-semibold">{labelFor(log.accion)}</span>
                            <span className="text-xs text-gray-500">
                              por <span className="font-medium text-gray-700 dark:text-gray-300">
                                {log.user?.name ?? log.user?.email ?? "Usuario desconocido"}
                              </span>
                            </span>
                            <span className="text-xs text-gray-400">
                              · {new Date(log.createdAt).toLocaleString("es-ES", {
                                day: "2-digit", month: "2-digit", year: "numeric",
                                hour: "2-digit", minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words">
                            {log.detalles}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </DialogContent>
            </Dialog>
            <Link href={`/budgets/${budget.id}/edit`}>
              <Button size="sm" className="gap-2">
                <Edit className="h-4 w-4" />
                Editar
              </Button>
            </Link>
            <Button
              size="sm"
              variant="destructive"
              className="gap-2"
              onClick={() => { setDeleteScope("app"); setShowDelete(true); }}
              disabled={loading}
            >
              <Trash className="h-4 w-4" />
              Eliminar
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(budget.estado)}`}>
            {budget.estado}
          </span>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {budget.tipo === "OTRO" && (budget as any).tipoCustom ? (budget as any).tipoCustom : budget.tipo}
          </span>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Comunidad Autónoma
            </h3>
            <p className="text-lg font-semibold mt-1">
              {budget.comunidadAutonoma}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Ciudad
            </h3>
            <p className="text-lg font-semibold mt-1">{budget.ciudad}</p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Fecha Solicitud
            </h3>
            <p className="text-lg font-semibold mt-1">
              {formatDate(budget.fechaSolicitud)}
            </p>
          </div>

          {budget.fechaEntrega && (
            <div>
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Fecha Entrega
              </h3>
              <p className="text-lg font-semibold mt-1">
                {formatDate(budget.fechaEntrega)}
              </p>
            </div>
          )}

          {budget.fechaPlazo && (
            <div>
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Fecha Plazo
              </h3>
              <p className="text-lg font-semibold mt-1">
                {formatDate(budget.fechaPlazo)}
              </p>
            </div>
          )}

          {!budget.contasimpleId && budget.descripcion && (
            <div className="md:col-span-2">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Descripción
              </h3>
              <p className="text-base mt-1 whitespace-pre-wrap">
                {budget.descripcion}
              </p>
            </div>
          )}

          {budget.notas && (
            <div className="md:col-span-2">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Notas
              </h3>
              <p className="text-base mt-1 whitespace-pre-wrap">
                {budget.notas}
              </p>
            </div>
          )}
        </div>
      </Card>

      <BudgetLinesEditor budget={budget} onSynced={handleFilesChange} />

      <FileUpload
        budgetId={budget.id}
        files={(budget.files ?? []).filter((f: any) => f.tipo !== "FACTURA_COMPRA")}
        onFilesChange={handleFilesChange}
      />

      <BudgetExpenses
        budgetId={budget.id}
        budget={budget}
        files={(budget.files ?? []).filter((f: any) => f.tipo === "FACTURA_COMPRA")}
        onFilesChange={handleFilesChange}
      />

      <Card className="p-6">
        <NotesSection budgetId={budget.id} />
      </Card>

    </div>

    <Dialog open={showDelete} onOpenChange={setShowDelete}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash className="h-5 w-5 text-red-600" />
            Eliminar presupuesto
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Elige dónde quieres eliminar este presupuesto. Esta acción no se puede deshacer.
          </p>
          <div className="space-y-2">
            <label className="flex items-start gap-3 p-3 rounded-md border cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
              <input
                type="radio"
                name="budget-delete-scope"
                className="mt-1"
                checked={deleteScope === "app"}
                onChange={() => setDeleteScope("app")}
              />
              <span>
                <span className="block text-sm font-medium">Solo en la aplicación</span>
                <span className="block text-xs text-gray-500">Se elimina de esta aplicación. En Contasimple se mantiene.</span>
              </span>
            </label>
            <label className={`flex items-start gap-3 p-3 rounded-md border ${hasContasimple ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" : "opacity-50 cursor-not-allowed"}`}>
              <input
                type="radio"
                name="budget-delete-scope"
                className="mt-1"
                disabled={!hasContasimple}
                checked={deleteScope === "contasimple"}
                onChange={() => setDeleteScope("contasimple")}
              />
              <span>
                <span className="block text-sm font-medium">Solo en Contasimple</span>
                <span className="block text-xs text-gray-500">Se elimina en Contasimple. En esta aplicación se conserva sin vínculo.</span>
              </span>
            </label>
            <label className={`flex items-start gap-3 p-3 rounded-md border ${hasContasimple ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" : "opacity-50 cursor-not-allowed"}`}>
              <input
                type="radio"
                name="budget-delete-scope"
                className="mt-1"
                disabled={!hasContasimple}
                checked={deleteScope === "both"}
                onChange={() => setDeleteScope("both")}
              />
              <span>
                <span className="block text-sm font-medium">En los dos sitios</span>
                <span className="block text-xs text-gray-500">Se elimina de esta aplicación y de Contasimple.</span>
              </span>
            </label>
          </div>
          {!hasContasimple && (
            <p className="text-xs text-amber-600">Este presupuesto no está vinculado a Contasimple, por lo que solo puede eliminarse en la aplicación.</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowDelete(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading ? "Eliminando..." : "Eliminar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}