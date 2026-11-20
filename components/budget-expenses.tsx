"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Upload,
  File as FileIcon,
  Trash,
  Download,
  Send,
  Loader2,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";

const DEFAULT_COPIA = "administracion@grupobluedrone.com";

interface BudgetExpensesProps {
  budgetId: string;
  budget: any;
  files: any[];
  onFilesChange: () => void;
}

export function BudgetExpenses({
  budgetId,
  budget,
  files,
  onFilesChange,
}: BudgetExpensesProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [gestorEmail, setGestorEmail] = useState("");
  const [copiaEmails, setCopiaEmails] = useState(DEFAULT_COPIA);
  const [mensaje, setMensaje] = useState("");

  const totalDocs = (budget?.files ?? []).length;

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const presignedResponse = await fetch(
        `/api/budgets/${budgetId}/files/presigned`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            fileType: "FACTURA_COMPRA",
          }),
        }
      );
      if (!presignedResponse.ok) throw new Error("Failed to get upload URL");
      const { uploadUrl } = await presignedResponse.json();
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error("Upload failed");
      toast.success("Factura de compra subida");
      onFilesChange();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Error al subir el archivo");
    } finally {
      setUploading(false);
    }
  };

  const handleFilesSelected = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    for (let i = 0; i < list.length; i++) {
      await handleUpload(list[i]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeleteFile = async (fileId: string) => {
    try {
      const response = await fetch(`/api/budgets/${budgetId}/files/${fileId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete");
      toast.success("Archivo eliminado");
      onFilesChange();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Error al eliminar el archivo");
    }
  };

  const handleDownloadFile = (file: any) => {
    const link = document.createElement("a");
    link.href = `/api/budgets/${budgetId}/files/${file.id}/download`;
    link.download = file.filename;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSend = async () => {
    if (!gestorEmail.trim()) {
      toast.error("Indica el email del gestor");
      return;
    }
    if (totalDocs === 0) {
      toast.error("Sube al menos una factura antes de enviar");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/budgets/${budgetId}/send-to-gestor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gestorEmail: gestorEmail.trim(),
          copiaEmails,
          mensaje,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d?.success) {
        toast.error(d?.error || d?.message || "No se pudo enviar");
        setSending(false);
        return;
      }
      toast.success(d?.message || "Documentación enviada al gestor");
      setSendOpen(false);
      setMensaje("");
      onFilesChange();
    } catch (error) {
      console.error("Send error:", error);
      toast.error("Error al enviar la documentación");
    } finally {
      setSending(false);
    }
  };

  const ref =
    budget?.contasimpleNumber || budget?.numeroFactura || budget?.nombre || "";

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-emerald-100 dark:bg-emerald-900/20 rounded">
            <Receipt className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Gastos / Facturas de compra
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Facturas de las compras que pertenecen a este presupuesto
            </p>
          </div>
        </div>
        <Button
          onClick={() => setSendOpen(true)}
          className="gap-2"
          variant="default"
        >
          <Send className="h-4 w-4" />
          Enviar al gestor
        </Button>
      </div>

      <div
        className="border-2 border-dashed border-gray-300 hover:border-emerald-500 dark:border-gray-600 dark:hover:border-emerald-400 p-6 text-center cursor-pointer transition-colors rounded-lg"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFilesSelected(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFilesSelected(e.target.files)}
        />
        <Upload className="mx-auto h-10 w-10 text-gray-400" />
        <p className="mt-2 font-medium text-sm">
          Arrastra las facturas de compra aquí o haz clic
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Puedes subir varias a la vez (PDF, imágenes…)
        </p>
        <Button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          className="mt-3"
          variant="outline"
          disabled={uploading}
        >
          {uploading ? "Subiendo..." : "Seleccionar facturas"}
        </Button>
      </div>

      {files && files.length > 0 ? (
        <div className="space-y-3 mt-4">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/20 rounded">
                  <FileIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.filename}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(file.uploadedAt).toLocaleDateString("es-ES")}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 ml-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 h-8"
                  onClick={() => handleDownloadFile(file)}
                  title="Descargar"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Descargar</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={() => handleDeleteFile(file.id)}
                  title="Eliminar"
                >
                  <Trash className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
          Aún no hay facturas de compra en este presupuesto.
        </p>
      )}

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-sky-600" />
              Enviar documentación al gestor
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm">
              <p className="text-gray-600 dark:text-gray-400">
                Se enviarán los enlaces de descarga de{" "}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {totalDocs} documento(s)
                </span>{" "}
                del presupuesto{ref ? ` ${ref}` : ""} (facturas de compra y demás
                documentos). Los enlaces son válidos 7 días.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Email del gestor *
              </label>
              <Input
                type="email"
                placeholder="gestor@gestoria.com"
                value={gestorEmail}
                onChange={(e) => setGestorEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Copia a (separar con comas)
              </label>
              <Input
                type="text"
                placeholder="administracion@grupobluedrone.com"
                value={copiaEmails}
                onChange={(e) => setCopiaEmails(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Por defecto se envía copia a administración de Grupo Bluedrone.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Mensaje (opcional)
              </label>
              <Textarea
                rows={3}
                placeholder="Añade una nota para el gestor si lo deseas…"
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setSendOpen(false)}
                disabled={sending}
              >
                Cancelar
              </Button>
              <Button onClick={handleSend} disabled={sending} className="gap-2">
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {sending ? "Enviando..." : "Enviar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
