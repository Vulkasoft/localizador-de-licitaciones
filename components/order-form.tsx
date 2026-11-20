"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_FILE_TYPE_LABELS,
} from "@/lib/order-utils";
import {
  Loader2,
  Paperclip,
  X,
  Upload,
  FileText,
  Search,
  FileSpreadsheet,
  ReceiptText,
  Link2,
} from "lucide-react";
import { toast } from "sonner";

interface OrderFile {
  id: string;
  filename: string;
  tipo: string;
}

interface OrderInitial {
  id: string;
  numeroAcopio?: string | null;
  numeroPedido?: string | null;
  numeroSeguimiento?: string | null;
  referencia?: string | null;
  referenciaTipo?: string | null;
  budgetId?: string | null;
  budget?: {
    id: string;
    contasimpleNumber?: string | null;
    numeroFactura?: string | null;
    contasimpleCompany?: string | null;
  } | null;
  empresa?: string | null;
  origen?: string | null;
  quienPidio?: string | null;
  fechaSolicitud?: string | null;
  estado: string;
  descripcion?: string | null;
  notas?: string | null;
  files?: OrderFile[];
}

interface PendingFile {
  file: File;
  name: string;
  tipo: string;
}

interface RefResult {
  id?: string;
  budgetId: string;
  tipo: "PRESUPUESTO" | "FACTURA";
  numero: string | null;
  contasimpleNumber: string | null;
  numeroFactura: string | null;
  facturado: boolean;
  sede: string | null;
  cliente: string | null;
  totalConIva: number | null;
  estado: string | null;
}

function sedeLabel(sede?: string | null): string {
  if (sede === "peninsula") return "Península";
  if (sede === "canarias") return "Canarias";
  return sede || "";
}

function toDateInput(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function OrderForm({ initialData }: { initialData?: OrderInitial }) {
  const router = useRouter();
  const isEditing = !!initialData;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [numeroAcopio, setNumeroAcopio] = useState(initialData?.numeroAcopio ?? "");
  const [numeroPedido, setNumeroPedido] = useState(initialData?.numeroPedido ?? "");
  const [numeroSeguimiento, setNumeroSeguimiento] = useState(
    initialData?.numeroSeguimiento ?? ""
  );
  const [referencia, setReferencia] = useState(initialData?.referencia ?? "");
  const [referenciaTipo, setReferenciaTipo] = useState(
    initialData?.referenciaTipo ?? ""
  );
  const [budgetId, setBudgetId] = useState(initialData?.budgetId ?? "");

  // Reference search picker state (searches synced Contasimple documents)
  const [refSearch, setRefSearch] = useState("");
  const [refTipo, setRefTipo] = useState<"PRESUPUESTO" | "FACTURA">(
    (initialData?.referenciaTipo as "PRESUPUESTO" | "FACTURA") || "PRESUPUESTO"
  );
  const [refResults, setRefResults] = useState<RefResult[]>([]);
  const [refSearching, setRefSearching] = useState(false);
  const [refOpen, setRefOpen] = useState(false);

  const [empresa, setEmpresa] = useState(initialData?.empresa ?? "");
  const [origen, setOrigen] = useState(initialData?.origen ?? "");
  const [quienPidio, setQuienPidio] = useState(initialData?.quienPidio ?? "");
  const [fechaSolicitud, setFechaSolicitud] = useState(
    toDateInput(initialData?.fechaSolicitud)
  );
  const [estado, setEstado] = useState(initialData?.estado ?? "SOLICITADO");
  const [descripcion, setDescripcion] = useState(initialData?.descripcion ?? "");
  const [notas, setNotas] = useState(initialData?.notas ?? "");

  const [existingFiles, setExistingFiles] = useState<OrderFile[]>(
    initialData?.files ?? []
  );
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [nextFileType, setNextFileType] = useState<string>("FACTURA_PAGO");
  const [saving, setSaving] = useState(false);

  // Debounced live search of synced Contasimple documents.
  useEffect(() => {
    const term = refSearch.trim();
    if (term.length < 2) {
      setRefResults([]);
      return;
    }
    let active = true;
    setRefSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/orders/reference-search?query=${encodeURIComponent(
            term
          )}&tipo=${refTipo}`
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (active) setRefResults(data.results ?? []);
      } catch {
        if (active) setRefResults([]);
      } finally {
        if (active) setRefSearching(false);
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [refSearch, refTipo]);

  const selectReference = (r: RefResult) => {
    setReferencia(r.numero || "");
    setReferenciaTipo(r.tipo);
    setBudgetId(r.budgetId);
    setRefSearch("");
    setRefResults([]);
    setRefOpen(false);
  };

  const useFreeReference = () => {
    const term = refSearch.trim();
    if (!term) return;
    setReferencia(term);
    setReferenciaTipo(refTipo);
    setBudgetId("");
    setRefSearch("");
    setRefResults([]);
    setRefOpen(false);
  };

  const clearReference = () => {
    setReferencia("");
    setReferenciaTipo("");
    setBudgetId("");
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setPendingFiles((prev) => [
      ...prev,
      ...files.map((f) => ({ file: f, name: f.name, tipo: nextFileType })),
    ]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingFile = async (fileId: string) => {
    if (!initialData) return;
    try {
      const res = await fetch(
        `/api/orders/${initialData.id}/files/${fileId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error();
      setExistingFiles((prev) => prev.filter((f) => f.id !== fileId));
      toast.success("Archivo eliminado");
    } catch {
      toast.error("Error al eliminar archivo");
    }
  };

  const uploadFiles = async (orderId: string) => {
    for (const pf of pendingFiles) {
      try {
        const presignedRes = await fetch(
          `/api/orders/${orderId}/files/presigned`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: pf.name,
              contentType: pf.file.type || "application/octet-stream",
              fileType: pf.tipo,
            }),
          }
        );
        if (!presignedRes.ok) throw new Error("Failed to get presigned URL");
        const { uploadUrl } = await presignedRes.json();

        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": pf.file.type || "application/octet-stream",
            "Content-Disposition": "attachment",
          },
          body: pf.file,
        });
        if (!uploadRes.ok) throw new Error("Upload failed");
      } catch (err) {
        console.error(`Error uploading ${pf.name}:`, err);
        toast.error(`Error subiendo ${pf.name}`);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        numeroAcopio,
        numeroPedido,
        numeroSeguimiento,
        referencia,
        referenciaTipo: referencia ? referenciaTipo || null : null,
        budgetId: budgetId || null,
        empresa,
        origen,
        quienPidio,
        fechaSolicitud: fechaSolicitud || null,
        estado,
        descripcion,
        notas,
      };

      const url = isEditing ? `/api/orders/${initialData!.id}` : "/api/orders";
      const method = isEditing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Error al guardar");
      const { order } = await res.json();

      if (pendingFiles.length > 0) {
        await uploadFiles(order.id);
      }

      toast.success(isEditing ? "Pedido actualizado" : "Pedido creado");
      router.push("/orders");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("No se pudo guardar el pedido");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-6">
      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
          Datos del pedido
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
              Nº de acopio
            </label>
            <Input
              value={numeroAcopio}
              onChange={(e) => setNumeroAcopio(e.target.value)}
              placeholder="Ej. ACO-2026-001"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
              Nº de pedido
            </label>
            <Input
              value={numeroPedido}
              onChange={(e) => setNumeroPedido(e.target.value)}
              placeholder="Ej. PED-00123"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
              Nº de seguimiento (tracking)
            </label>
            <Input
              value={numeroSeguimiento}
              onChange={(e) => setNumeroSeguimiento(e.target.value)}
              placeholder="Ej. 1Z999AA10123456784"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
              Presupuesto / factura de Contasimple
            </label>

            {referencia ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  {referenciaTipo === "FACTURA" ? (
                    <ReceiptText className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sky-800 dark:text-sky-200 truncate">
                        {referencia}
                      </span>
                      {referenciaTipo && (
                        <span className="text-[11px] uppercase tracking-wide text-sky-600 dark:text-sky-400">
                          {referenciaTipo === "FACTURA" ? "Factura" : "Presupuesto"}
                        </span>
                      )}
                    </div>
                    {budgetId ? (
                      <a
                        href={`/budgets/${budgetId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:underline"
                      >
                        <Link2 className="h-3 w-3" /> Documento vinculado en Contasimple · ver detalle
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">Referencia libre (sin vincular)</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearReference}
                  className="text-gray-400 hover:text-red-500 shrink-0"
                  aria-label="Quitar referencia"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setRefTipo("PRESUPUESTO")}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border transition-colors ${
                      refTipo === "PRESUPUESTO"
                        ? "bg-sky-600 border-sky-600 text-white"
                        : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    <FileSpreadsheet className="h-4 w-4" /> Presupuesto
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefTipo("FACTURA")}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border transition-colors ${
                      refTipo === "FACTURA"
                        ? "bg-sky-600 border-sky-600 text-white"
                        : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    <ReceiptText className="h-4 w-4" /> Factura
                  </button>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    value={refSearch}
                    onChange={(e) => {
                      setRefSearch(e.target.value);
                      setRefOpen(true);
                    }}
                    onFocus={() => setRefOpen(true)}
                    placeholder={
                      refTipo === "FACTURA"
                        ? "Buscar nº de factura en Contasimple..."
                        : "Buscar nº de presupuesto en Contasimple..."
                    }
                    className="pl-9"
                  />
                  {refSearching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />
                  )}
                </div>

                {refOpen && refSearch.trim().length >= 2 && (
                  <div className="absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg">
                    {refResults.length > 0 ? (
                      refResults.map((r) => (
                        <button
                          key={r.id || `${r.budgetId}-${r.tipo}`}
                          type="button"
                          onClick={() => selectReference(r)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-sky-50 dark:hover:bg-sky-950/40 border-b border-gray-100 dark:border-gray-800 last:border-0"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {r.tipo === "FACTURA" ? (
                                <ReceiptText className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              ) : (
                                <FileSpreadsheet className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                              )}
                              <span className="font-semibold text-gray-900 dark:text-white truncate">
                                {r.numero}
                              </span>
                              <span className="text-[10px] uppercase tracking-wide text-gray-400">
                                {r.tipo === "FACTURA" ? "Factura" : "Presupuesto"}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {[r.cliente, sedeLabel(r.sede)].filter(Boolean).join(" · ")}
                            </div>
                          </div>
                          {typeof r.totalConIva === "number" && (
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-300 shrink-0">
                              {r.totalConIva.toLocaleString("es-ES", {
                                style: "currency",
                                currency: "EUR",
                              })}
                            </span>
                          )}
                        </button>
                      ))
                    ) : !refSearching ? (
                      <div className="px-3 py-2 text-sm text-gray-500">
                        No se encontró ningún documento con ese número.
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={useFreeReference}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 border-t border-gray-100 dark:border-gray-800"
                    >
                      <Link2 className="h-3.5 w-3.5 text-gray-400" />
                      Usar «{refSearch.trim()}» como referencia libre
                    </button>
                  </div>
                )}

                <p className="text-xs text-gray-400 mt-1">
                  Busca el presupuesto o la factura en Contasimple para mantener la trazabilidad del documento.
                </p>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
              Empresa / proveedor
            </label>
            <Input
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              placeholder="A quién se le pidió"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
              Origen / procedencia
            </label>
            <Input
              value={origen}
              onChange={(e) => setOrigen(e.target.value)}
              list="origen-options"
              placeholder="China, Península, Canarias..."
            />
            <datalist id="origen-options">
              <option value="China" />
              <option value="Península" />
              <option value="Canarias" />
              <option value="Unión Europea" />
              <option value="Otro" />
            </datalist>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
              Quién hizo el pedido
            </label>
            <Input
              value={quienPidio}
              onChange={(e) => setQuienPidio(e.target.value)}
              placeholder="Nombre de la persona"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
              Fecha de solicitud
            </label>
            <Input
              type="date"
              value={fechaSolicitud}
              onChange={(e) => setFechaSolicitud(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
              Estado
            </label>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {ORDER_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
            Descripción de la mercancía
          </label>
          <Textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={3}
            placeholder="Qué se pidió: material, cantidades, referencias..."
          />
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
            Notas internas
          </label>
          <Textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            placeholder="Observaciones, incidencias, seguimiento..."
          />
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold mb-1 text-gray-900 dark:text-white">
          Documentos
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Adjunta la factura de pago de la mercancía, el documento de
          transferencia u otros justificantes.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
              Tipo de documento
            </label>
            <Select value={nextFileType} onValueChange={setNextFileType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FACTURA_PAGO">Factura de pago</SelectItem>
                <SelectItem value="TRANSFERENCIA">
                  Documento de transferencia
                </SelectItem>
                <SelectItem value="OTRO">Otro documento</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFilePick}
              className="hidden"
              id="order-file-input"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="w-full sm:w-auto"
            >
              <Upload className="w-4 h-4 mr-2" />
              Añadir archivo
            </Button>
          </div>
        </div>

        {(existingFiles.length > 0 || pendingFiles.length > 0) && (
          <div className="mt-4 space-y-2">
            {existingFiles.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2"
              >
                <FileText className="w-4 h-4 text-sky-500 flex-shrink-0" />
                <a
                  href={`/api/orders/${initialData!.id}/files/${f.id}/download`}
                  className="text-sm text-sky-600 dark:text-sky-400 hover:underline truncate flex-1"
                >
                  {f.filename}
                </a>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 whitespace-nowrap">
                  {ORDER_FILE_TYPE_LABELS[f.tipo] ?? "Documento"}
                </span>
                <button
                  type="button"
                  onClick={() => removeExistingFile(f.id)}
                  className="text-gray-400 hover:text-red-500"
                  aria-label="Eliminar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            {pendingFiles.map((pf, i) => (
              <div
                key={`p-${i}`}
                className="flex items-center gap-3 rounded-lg border border-dashed border-amber-300 dark:border-amber-500/40 bg-amber-50/50 dark:bg-amber-500/5 px-3 py-2"
              >
                <Paperclip className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <span className="text-sm text-gray-700 dark:text-gray-200 truncate flex-1">
                  {pf.name}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 whitespace-nowrap">
                  {ORDER_FILE_TYPE_LABELS[pf.tipo] ?? "Documento"} · pendiente
                </span>
                <button
                  type="button"
                  onClick={() => removePendingFile(i)}
                  className="text-gray-400 hover:text-red-500"
                  aria-label="Quitar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/orders")}
          disabled={saving}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isEditing ? "Guardar cambios" : "Crear pedido"}
        </Button>
      </div>
    </form>
  );
}
