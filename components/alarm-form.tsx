"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, X, Upload, FileText, Trash2, Plus, Bell } from "lucide-react";
import Link from "next/link";

interface AlarmFormProps {
  initialData?: {
    id: string;
    titulo: string;
    descripcion: string | null;
    fechaLimite: string;
    diasAntelacion: number;
    emailsDestino: string;
    documentos: string | null;
    budgetId: string | null;
    budget?: { id: string; nombre: string | null; cliente: string | null } | null;
    alarmFiles?: { id: string; filename: string; s3Key: string }[];
  };
  budgets?: { id: string; nombre: string | null; cliente: string | null }[];
}

interface PendingFile {
  file: File;
  name: string;
}

export function AlarmForm({ initialData, budgets = [] }: AlarmFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [existingFiles, setExistingFiles] = useState(initialData?.alarmFiles || []);

  const [titulo, setTitulo] = useState(initialData?.titulo || "");
  const [descripcion, setDescripcion] = useState(initialData?.descripcion || "");
  const [fechaLimite, setFechaLimite] = useState(
    initialData?.fechaLimite
      ? new Date(initialData.fechaLimite).toISOString().split("T")[0]
      : ""
  );
  const [diasAntelacion, setDiasAntelacion] = useState(
    initialData?.diasAntelacion ?? 1
  );
  const [emailsDestino, setEmailsDestino] = useState(
    initialData?.emailsDestino || ""
  );
  const [documentos, setDocumentos] = useState(initialData?.documentos || "");
  const [budgetId, setBudgetId] = useState(initialData?.budgetId || "");

  const isEditing = !!initialData;

  // Modo de envío: aviso inmediato ahora y/o programar alarma de preaviso
  const [avisoInmediato, setAvisoInmediato] = useState(false);
  const [programarAlarma, setProgramarAlarma] = useState(true);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles: PendingFile[] = Array.from(files).map((f) => ({
      file: f,
      name: f.name,
    }));
    setPendingFiles((prev) => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingFile = async (fileId: string) => {
    if (!initialData) return;
    try {
      const res = await fetch(
        `/api/alarms/${initialData.id}/files/${fileId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error();
      setExistingFiles((prev) => prev.filter((f) => f.id !== fileId));
      toast.success("Archivo eliminado");
    } catch {
      toast.error("Error al eliminar archivo");
    }
  };

  const uploadFiles = async (alarmId: string) => {
    for (const pf of pendingFiles) {
      try {
        const presignedRes = await fetch(`/api/alarms/${alarmId}/files/presigned`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: pf.name,
            contentType: pf.file.type || "application/octet-stream",
          }),
        });
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

  const [sendingAviso, setSendingAviso] = useState(false);
  const handleSendAvisoNow = async () => {
    if (!titulo.trim()) {
      toast.error("El título es obligatorio");
      return;
    }
    if (!emailsDestino.trim()) {
      toast.error("Debe indicar al menos un email de destino");
      return;
    }
    setSendingAviso(true);
    try {
      const res = await fetch("/api/alarms/send-aviso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: titulo.trim(),
          descripcion: descripcion.trim() || null,
          documentos: documentos.trim() || null,
          fechaLimite: fechaLimite || null,
          emailsDestino: emailsDestino.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al enviar el aviso inmediato");
      }
      toast.success("Aviso inmediato enviado");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al enviar el aviso";
      toast.error(message);
    } finally {
      setSendingAviso(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) {
      toast.error("El título es obligatorio");
      return;
    }
    // En creación debe elegirse al menos un modo
    if (!isEditing && !avisoInmediato && !programarAlarma) {
      toast.error("Elige enviar un aviso inmediato y/o programar la alarma");
      return;
    }
    const requiereFecha = isEditing || programarAlarma;
    if (requiereFecha && !fechaLimite) {
      toast.error("La fecha límite es obligatoria");
      return;
    }
    if (!emailsDestino.trim()) {
      toast.error("Debe indicar al menos un email de destino");
      return;
    }

    setIsSubmitting(true);
    try {
      // 1) Aviso inmediato (solo en creación, si está marcado)
      if (!isEditing && avisoInmediato) {
        const ires = await fetch("/api/alarms/send-aviso", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titulo: titulo.trim(),
            descripcion: descripcion.trim() || null,
            documentos: documentos.trim() || null,
            fechaLimite: fechaLimite || null,
            emailsDestino: emailsDestino.trim(),
          }),
        });
        if (!ires.ok) {
          const data = await ires.json().catch(() => ({}));
          throw new Error(data.error || "Error al enviar el aviso inmediato");
        }
        toast.success("Aviso inmediato enviado");
      }

      // 2) Programar alarma de preaviso (siempre en edición, o si está marcado en creación)
      if (isEditing || programarAlarma) {
        const payload = {
          titulo: titulo.trim(),
          descripcion: descripcion.trim() || null,
          fechaLimite,
          diasAntelacion,
          emailsDestino: emailsDestino.trim(),
          documentos: documentos.trim() || null,
          budgetId: budgetId || null,
        };

        const url = isEditing ? `/api/alarms/${initialData.id}` : "/api/alarms";
        const method = isEditing ? "PUT" : "POST";

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Error");
        }

        const alarm = await res.json();

        // Upload pending files
        if (pendingFiles.length > 0) {
          toast.info("Subiendo archivos...");
          await uploadFiles(alarm.id);
        }

        toast.success(isEditing ? "Alarma actualizada" : "Alarma programada");
      }

      router.push("/alarms");
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al guardar la alarma";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link href="/alarms">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a Alarmas
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-orange-500" />
            {isEditing ? "Editar Alarma" : "Nueva Alarma"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Modo de envío (solo al crear) */}
            {!isEditing && (
              <div className="rounded-md border border-input bg-background/60 p-3 space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={avisoInmediato}
                    onChange={(e) => setAvisoInmediato(e.target.checked)}
                  />
                  <Bell className="h-4 w-4 text-blue-500" /> Enviar un aviso inmediato ahora
                </label>
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={programarAlarma}
                    onChange={(e) => setProgramarAlarma(e.target.checked)}
                  />
                  <Bell className="h-4 w-4 text-amber-500" /> Programar alarma de preaviso
                </label>
                <p className="text-xs text-gray-400 leading-snug">
                  El aviso inmediato envía un correo ahora mismo a los destinatarios. El preaviso
                  programado se revisa una vez al día por la mañana (~8:15 h) y avisa desde los días
                  de antelación indicados hasta la fecha límite.
                </p>
              </div>
            )}

            {/* Título */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Título *
              </label>
              <Input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ej: Licitación Ayuntamiento de Mogán"
              />
            </div>

            {/* Descripción */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Descripción
              </label>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Detalles adicionales sobre esta alarma..."
                rows={3}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Fecha límite y días antelación */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Fecha límite {isEditing || programarAlarma ? "*" : "(opcional)"}
                </label>
                <Input
                  type="date"
                  value={fechaLimite}
                  onChange={(e) => setFechaLimite(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Días de antelación para avisar
                </label>
                <Input
                  type="number"
                  min={0}
                  value={diasAntelacion}
                  onChange={(e) => setDiasAntelacion(parseInt(e.target.value) || 0)}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Se enviará un email diario desde {diasAntelacion} día{diasAntelacion !== 1 ? "s" : ""} antes hasta la fecha límite
                </p>
              </div>
            </div>

            {/* Emails destino */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Emails de destino *
              </label>
              <Input
                value={emailsDestino}
                onChange={(e) => setEmailsDestino(e.target.value)}
                placeholder="email1@ejemplo.com, email2@ejemplo.com"
              />
              <p className="text-xs text-gray-500 mt-1">
                Separe múltiples emails con comas
              </p>
            </div>

            {/* Documentos a presentar */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Documentos a presentar
              </label>
              <textarea
                value={documentos}
                onChange={(e) => setDocumentos(e.target.value)}
                placeholder="Lista de documentos que hay que presentar...
- Memoria técnica
- Presupuesto desglosado
- Certificados"
                rows={4}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Vincular presupuesto */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Vincular a presupuesto (opcional)
              </label>
              <select
                value={budgetId}
                onChange={(e) => setBudgetId(e.target.value)}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Sin vincular</option>
                {budgets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre || b.cliente || "(sin nombre)"} - {b.cliente || ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Archivos adjuntos */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Documentos adjuntos
              </label>

              {/* Existing files */}
              {existingFiles.length > 0 && (
                <div className="space-y-2 mb-3">
                  {existingFiles.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-md border"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-500" />
                        <span className="text-sm">{f.filename}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeExistingFile(f.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Pending files */}
              {pendingFiles.length > 0 && (
                <div className="space-y-2 mb-3">
                  {pendingFiles.map((pf, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-500" />
                        <span className="text-sm">{pf.name}</span>
                        <span className="text-xs text-gray-400">(pendiente)</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removePendingFile(i)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.txt,.csv"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Adjuntar archivos
              </Button>
            </div>

            {/* Enviar aviso inmediato al editar */}
            {isEditing && (
              <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-200 flex items-center gap-2">
                    <Bell className="h-4 w-4 text-blue-500" /> Aviso inmediato
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                    Envía ahora mismo un correo a los destinatarios con los datos actuales (no cambia la alarma programada).
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSendAvisoNow}
                  disabled={sendingAviso}
                  className="border-blue-400 text-blue-700 hover:bg-blue-100 dark:text-blue-200"
                >
                  {sendingAviso ? "Enviando..." : "Enviar aviso ahora"}
                </Button>
              </div>
            )}

            {/* Submit */}
            <div className="flex gap-3 pt-4 border-t">
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting
                  ? "Guardando..."
                  : isEditing
                  ? "Actualizar Alarma"
                  : avisoInmediato && !programarAlarma
                  ? "Enviar aviso ahora"
                  : avisoInmediato && programarAlarma
                  ? "Enviar aviso y programar"
                  : "Programar Alarma"}
              </Button>
              <Link href="/alarms">
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
