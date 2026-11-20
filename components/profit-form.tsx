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
  PROFIT_STATUSES,
  PROFIT_STATUS_LABELS,
  PROFIT_FILE_TYPE_LABELS,
  splitProfit,
  parseMoney,
  formatEur,
} from "@/lib/profit-utils";
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
  PiggyBank,
} from "lucide-react";
import { toast } from "sonner";

interface ProfitFile {
  id: string;
  filename: string;
  tipo: string;
}

interface ProfitInitial {
  id: string;
  concepto?: string | null;
  referencia?: string | null;
  referenciaTipo?: string | null;
  budgetId?: string | null;
  budget?: {
    id: string;
    contasimpleNumber?: string | null;
    numeroFactura?: string | null;
    contasimpleCompany?: string | null;
  } | null;
  importeVenta?: number | null;
  beneficio?: number | null;
  estado: string;
  fechaVenta?: string | null;
  fechaPago?: string | null;
  notas?: string | null;
  files?: ProfitFile[];
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

export function ProfitForm({ initialData }: { initialData?: ProfitInitial }) {
  const router = useRouter();
  const isEditing = !!initialData;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [concepto, setConcepto] = useState(initialData?.concepto ?? "");
  const [referencia, setReferencia] = useState(initialData?.referencia ?? "");
  const [referenciaTipo, setReferenciaTipo] = useState(
    initialData?.referenciaTipo ?? ""
  );
  const [budgetId, setBudgetId] = useState(initialData?.budgetId ?? "");

  const [refSearch, setRefSearch] = useState("");
  const [refTipo, setRefTipo] = useState<"PRESUPUESTO" | "FACTURA">(
    (initialData?.referenciaTipo as "PRESUPUESTO" | "FACTURA") || "FACTURA"
  );
  const [refResults, setRefResults] = useState<RefResult[]>([]);
  const [refSearching, setRefSearching] = useState(false);
  const [refError, setRefError] = useState("");
  const [refOpen, setRefOpen] = useState(false);

  const [importeVenta, setImporteVenta] = useState(
    initialData?.importeVenta != null ? String(initialData.importeVenta) : ""
  );
  const [beneficio, setBeneficio] = useState(
    initialData?.beneficio != null ? String(initialData.beneficio) : ""
  );
  const [estado, setEstado] = useState(initialData?.estado ?? "PENDIENTE");
  const [fechaVenta, setFechaVenta] = useState(
    toDateInput(initialData?.fechaVenta)
  );
  const [fechaPago, setFechaPago] = useState(toDateInput(initialData?.fechaPago));
  const [notas, setNotas] = useState(initialData?.notas ?? "");

  const [existingFiles, setExistingFiles] = useState<ProfitFile[]>(
    initialData?.files ?? []
  );
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [nextFileType, setNextFileType] = useState<string>(
    initialData?.estado === "PAGADO" ? "TRANSFERENCIA" : "FACTURA_VULKASOFT"
  );
  const [saving, setSaving] = useState(false);

  // Live split preview
  const beneficioNum = parseMoney(beneficio) ?? 0;
  const { parteVulkasoft, parteBluedrone } = splitProfit(beneficioNum);

  useEffect(() => {
    const term = refSearch.trim();
    setRefResults([]);
    setRefError("");
    if (term.length < 2) {
      setRefSearching(false);
      return;
    }
    let active = true;
    const controller = new AbortController();
    setRefSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/orders/reference-search?query=${encodeURIComponent(
            term
          )}&tipo=${refTipo}`, { signal: controller.signal }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "No se pudo consultar Contasimple.");
        if (active) {
          setRefResults(data.results ?? []);
          setRefError((data.warnings ?? []).join(" "));
        }
      } catch (error) {
        if (active) {
          console.error("Error buscando referencia", error);
          setRefResults([]);
          setRefError(error instanceof Error ? error.message : "No se pudo consultar Contasimple.");
        }
      } finally {
        if (active) setRefSearching(false);
      }
    }, 350);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(t);
    };
  }, [refSearch, refTipo]);

  const selectReference = (r: RefResult) => {
    setReferencia(r.numero || "");
    setReferenciaTipo(r.tipo);
    setBudgetId(r.budgetId);
    // If the linked budget carries a total, prefill importe de venta if empty.
    if (!importeVenta && typeof r.totalConIva === "number") {
      setImporteVenta(String(r.totalConIva));
    }
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
        `/api/profit-shares/${initialData.id}/files/${fileId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error();
      setExistingFiles((prev) => prev.filter((f) => f.id !== fileId));
      toast.success("Archivo eliminado");
    } catch {
      toast.error("Error al eliminar archivo");
    }
  };

  const uploadFiles = async (profitId: string) => {
    for (const pf of pendingFiles) {
      try {
        const presignedRes = await fetch(
          `/api/profit-shares/${profitId}/files/presigned`,
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
        concepto,
        referencia,
        referenciaTipo: referencia ? referenciaTipo || null : null,
        budgetId: budgetId || null,
        importeVenta: importeVenta || null,
        beneficio: beneficio || "0",
        estado,
        fechaVenta: fechaVenta || null,
        fechaPago: fechaPago || null,
        notas,
      };

      const url = isEditing
        ? `/api/profit-shares/${initialData!.id}`
        : "/api/profit-shares";
      const method = isEditing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Error al guardar");
      const { profitShare } = await res.json();

      if (pendingFiles.length > 0) {
        await uploadFiles(profitShare.id);
      }

      toast.success(isEditing ? "Beneficio actualizado" : "Beneficio registrado");
      router.push("/beneficios");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("No se pudo guardar el registro");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-6">
      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
          Datos de la venta
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
              Concepto
            </label>
            <Input
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Ej. Venta DJI Matrice 350 - Ayto. de Adeje"
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
                      <span className="text-xs text-gray-400">Referencia sin presupuesto local vinculado</span>
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
                    {refError && <div role="alert" className="px-3 py-2 text-sm text-red-600 dark:text-red-400">{refError}</div>}
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
                              {formatEur(r.totalConIva)}
                            </span>
                          )}
                        </button>
                      ))
                    ) : !refSearching && !refError ? (
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
                  {refTipo === "FACTURA" ? "Busca facturas reales de ambas sedes. Incluye el año para buscar facturas antiguas; sin año se consultan este año y el anterior." : "Vincula el presupuesto para saber a qué venta corresponde este beneficio."}
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
              Importe de la venta (opcional)
            </label>
            <Input
              value={importeVenta}
              onChange={(e) => setImporteVenta(e.target.value)}
              inputMode="decimal"
              placeholder="Ej. 12.500"
            />
            <p className="text-xs text-gray-400 mt-1">Total facturado al cliente.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
              Margen / beneficio a repartir €
            </label>
            <Input
              value={beneficio}
              onChange={(e) => setBeneficio(e.target.value)}
              inputMode="decimal"
              placeholder="Ej. 3.000"
            />
            <p className="text-xs text-gray-400 mt-1">
              El beneficio neto que se reparte (se divide en 3).
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
              Fecha de venta / facturación
            </label>
            <Input
              type="date"
              value={fechaVenta}
              onChange={(e) => setFechaVenta(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
              Estado del cobro
            </label>
            <Select
              value={estado}
              onValueChange={(v) => {
                setEstado(v);
                if (v === "PAGADO" && !fechaPago) {
                  setFechaPago(new Date().toISOString().slice(0, 10));
                }
                setNextFileType(
                  v === "PAGADO" ? "TRANSFERENCIA" : "FACTURA_VULKASOFT"
                );
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROFIT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {PROFIT_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {estado === "PAGADO" && (
            <div>
              <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                Fecha de pago
              </label>
              <Input
                type="date"
                value={fechaPago}
                onChange={(e) => setFechaPago(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Split preview */}
        <div className="mt-5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/30 p-4">
          <div className="flex items-center gap-2 mb-3 text-emerald-800 dark:text-emerald-300">
            <PiggyBank className="h-5 w-5" />
            <span className="font-semibold">Reparto del beneficio</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Beneficio total</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {formatEur(beneficioNum)}
              </p>
            </div>
            <div className="rounded-lg bg-white dark:bg-gray-900 border border-sky-200 dark:border-sky-800 p-3">
              <p className="text-xs text-sky-600 dark:text-sky-400">
                VulkaSoft (tú) · 1/3
              </p>
              <p className="text-lg font-bold text-sky-700 dark:text-sky-300">
                {formatEur(parteVulkasoft)}
              </p>
            </div>
            <div className="rounded-lg bg-white dark:bg-gray-900 border border-indigo-200 dark:border-indigo-800 p-3">
              <p className="text-xs text-indigo-600 dark:text-indigo-400">
                Grupo Bluedrone · 2/3
              </p>
              <p className="text-lg font-bold text-indigo-700 dark:text-indigo-300">
                {formatEur(parteBluedrone)}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
            Notas internas
          </label>
          <Textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            placeholder="Observaciones sobre el cobro, el reparto, etc."
          />
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold mb-1 text-gray-900 dark:text-white">
          Documentos
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Sube el justificante de transferencia cuando esté pagado, o la factura
          de VulkaSoft a Grupo Bluedrone mientras está pendiente de cobro.
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
                <SelectItem value="TRANSFERENCIA">
                  Transferencia (justificante de pago)
                </SelectItem>
                <SelectItem value="FACTURA_VULKASOFT">
                  Factura VulkaSoft → Grupo Bluedrone
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
              id="profit-file-input"
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
                  href={`/api/profit-shares/${initialData!.id}/files/${f.id}/download`}
                  className="text-sm text-sky-600 dark:text-sky-400 hover:underline truncate flex-1"
                >
                  {f.filename}
                </a>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 whitespace-nowrap">
                  {PROFIT_FILE_TYPE_LABELS[f.tipo] ?? "Documento"}
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
                  {PROFIT_FILE_TYPE_LABELS[pf.tipo] ?? "Documento"} · pendiente
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
          onClick={() => router.push("/beneficios")}
          disabled={saving}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isEditing ? "Guardar cambios" : "Registrar beneficio"}
        </Button>
      </div>
    </form>
  );
}
