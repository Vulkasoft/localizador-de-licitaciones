"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomerCombobox } from "@/components/customer-combobox";
import { BudgetCombobox } from "@/components/budget-combobox";
import Link from "next/link";
import {
  Plus, Trash2, CheckCircle, Clock, AlertCircle, Phone, Pencil,
  X, FileSpreadsheet, Users, Search as SearchIcon, StickyNote,
  Bell, Paperclip, Download, Upload, Loader2, CheckCircle2, Square,
  FolderInput, Landmark,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

type Estado = "PENDING" | "DONE" | "ATTEMPTED" | "COMPLETED";

interface NoteLink { id: string; nombre?: string | null; cliente?: string | null; title?: string | null; }
interface Note {
  id: string;
  titulo: string;
  descripcion?: string | null;
  color?: string | null;
  estado: Estado;
  createdAt: string;
  budgetId?: string | null;
  customerId?: string | null;
  tenderId?: string | null;
  user?: { name?: string | null };
  budget?: NoteLink | null;
  customer?: NoteLink | null;
  tender?: NoteLink | null;
  _count?: { alarms?: number; files?: number };
  alarms?: NoteAlarm[];
  files?: NoteFile[];
}

interface NoteAlarm {
  id: string;
  titulo: string;
  fechaLimite: string;
  diasAntelacion: number;
  emailsDestino: string;
  estado?: string;
}
interface NoteFile {
  id: string;
  filename: string;
  fileSize?: number | null;
  uploadedAt: string;
}

const COLORS = [
  { name: "Ninguno", value: "", dot: "#cbd5e1" },
  { name: "Amarillo", value: "amber", dot: "#f59e0b" },
  { name: "Verde", value: "green", dot: "#16a34a" },
  { name: "Azul", value: "blue", dot: "#2563eb" },
  { name: "Rojo", value: "red", dot: "#dc2626" },
  { name: "Morado", value: "purple", dot: "#9333ea" },
];
const colorBar: Record<string, string> = {
  amber: "border-l-amber-500", green: "border-l-green-500", blue: "border-l-blue-500",
  red: "border-l-red-500", purple: "border-l-purple-500",
};

const STATUS = {
  PENDING: { label: "Pendiente", icon: Clock, cls: "text-gray-400" },
  DONE: { label: "Hecho", icon: CheckCircle, cls: "text-green-600" },
  ATTEMPTED: { label: "Intentado", icon: AlertCircle, cls: "text-yellow-600" },
  COMPLETED: { label: "Completado", icon: Phone, cls: "text-blue-600" },
} as const;

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function NotesManager({ variant = "active" }: { variant?: "active" | "completed" }) {
  const isCompleted = variant === "completed";
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState<string>(isCompleted ? "COMPLETED" : "PENDING");
  const [filterCustomerId, setFilterCustomerId] = useState<string | null>(null);
  const [filterCustomerLabel, setFilterCustomerLabel] = useState<string | null>(null);
  const [filterBudgetId, setFilterBudgetId] = useState<string | null>(null);
  const [filterBudgetLabel, setFilterBudgetLabel] = useState<string | null>(null);
  const [filterTenderId, setFilterTenderId] = useState<string | null>(null);
  const [filterTenderLabel, setFilterTenderLabel] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [color, setColor] = useState("");
  const [linkType, setLinkType] = useState<"none" | "customer" | "budget">("none");
  const [linkId, setLinkId] = useState("");
  const [linkCustomerLabel, setLinkCustomerLabel] = useState<string | null>(null);
  const [linkBudgetLabel, setLinkBudgetLabel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // alarm state
  const [avisoInmediato, setAvisoInmediato] = useState(false);
  const [alarmEnabled, setAlarmEnabled] = useState(false);
  const [alarmFecha, setAlarmFecha] = useState("");
  const [alarmDias, setAlarmDias] = useState(1);
  const [alarmEmails, setAlarmEmails] = useState("");
  const [existingAlarms, setExistingAlarms] = useState<NoteAlarm[]>([]);

  // files state
  const [files, setFiles] = useState<NoteFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // files viewer modal (from list badge)
  const [filesModalNote, setFilesModalNote] = useState<Note | null>(null);
  const [modalFiles, setModalFiles] = useState<NoteFile[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  // "Mover a Alarmas" modal state
  const [moveAlarmNote, setMoveAlarmNote] = useState<Note | null>(null);
  const [mvFecha, setMvFecha] = useState("");
  const [mvDias, setMvDias] = useState(1);
  const [mvEmails, setMvEmails] = useState("jose.mora@localizandotudron.com");
  const [mvSaving, setMvSaving] = useState(false);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      const estadoParam = isCompleted ? "COMPLETED" : filterEstado || "ACTIVE";
      p.set("estado", estadoParam);
      if (filterCustomerId) p.set("customerId", filterCustomerId);
      if (filterBudgetId) p.set("budgetId", filterBudgetId);
      if (filterTenderId) p.set("tenderId", filterTenderId);
      const res = await fetch(`/api/notes?${p.toString()}`);
      const data = await res.json();
      setNotes(data.notes || []);
    } catch {
      toast.error("Error al cargar el seguimiento");
    } finally {
      setLoading(false);
    }
  }, [search, filterEstado, filterCustomerId, filterBudgetId, filterTenderId, isCompleted]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const bId = params.get("budgetId");
    if (bId) {
      setFilterBudgetId(bId);
      const bLabel = params.get("budgetLabel");
      if (bLabel) setFilterBudgetLabel(bLabel);
    }
    const tId = params.get("tenderId");
    if (tId) {
      setFilterTenderId(tId);
      const tLabel = params.get("tenderLabel");
      if (tLabel) setFilterTenderLabel(tLabel);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(fetchNotes, 250);
    return () => clearTimeout(t);
  }, [fetchNotes]);

  const resetForm = () => {
    setEditingId(null); setTitulo(""); setDescripcion(""); setColor("");
    setLinkType("none"); setLinkId(""); setLinkCustomerLabel(null); setLinkBudgetLabel(null); setShowForm(false);
    setAvisoInmediato(false); setAlarmEnabled(false); setAlarmFecha(""); setAlarmDias(1); setAlarmEmails("");
    setExistingAlarms([]); setFiles([]); setPendingFiles([]);
  };

  const openNew = () => { resetForm(); setShowForm(true); };

  const loadNoteDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/notes/${id}`);
      const data = await res.json();
      if (data?.note) {
        setExistingAlarms(data.note.alarms || []);
        setFiles(data.note.files || []);
      }
    } catch { /* ignore */ }
  };

  const openEdit = (n: Note) => {
    setEditingId(n.id); setTitulo(n.titulo); setDescripcion(n.descripcion || "");
    setColor(n.color || "");
    if (n.customerId) { setLinkType("customer"); setLinkId(n.customerId); setLinkCustomerLabel(n.customer?.nombre || null); setLinkBudgetLabel(null); }
    else if (n.budgetId) { setLinkType("budget"); setLinkId(n.budgetId); setLinkCustomerLabel(null); setLinkBudgetLabel(n.budget?.nombre || n.budget?.cliente || null); }
    else { setLinkType("none"); setLinkId(""); setLinkCustomerLabel(null); setLinkBudgetLabel(null); }
    setAvisoInmediato(false); setAlarmEnabled(false); setAlarmFecha(""); setAlarmDias(1); setAlarmEmails("");
    setExistingAlarms([]); setFiles([]);
    setShowForm(true);
    loadNoteDetail(n.id);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) return;
    if (alarmEnabled && !alarmFecha) { toast.error("Indica la fecha de la alarma programada"); return; }
    if ((alarmEnabled || avisoInmediato) && !alarmEmails.trim()) {
      toast.error("Indica al menos un correo para el aviso"); return;
    }
    setSaving(true);
    const payload: any = {
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || null,
      color: color || null,
      budgetId: linkType === "budget" ? linkId || null : null,
      customerId: linkType === "customer" ? linkId || null : null,
    };
    try {
      const res = await fetch(editingId ? `/api/notes/${editingId}` : "/api/notes", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const saved = await res.json();
      const noteId = editingId || saved?.note?.id;

      // upload any files staged before the note existed
      if (!editingId && pendingFiles.length && noteId) {
        for (const f of pendingFiles) {
          try { await uploadFileToNote(noteId, f); } catch { toast.error(`No se pudo subir ${f.name}`); }
        }
      }

      // send an immediate aviso if requested
      if (avisoInmediato && noteId) {
        const ires = await fetch(`/api/notes/${noteId}/send-aviso`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titulo: titulo.trim(),
            descripcion: descripcion.trim() || null,
            emailsDestino: alarmEmails.trim(),
          }),
        });
        if (!ires.ok) {
          const d = await ires.json().catch(() => ({}));
          toast.error(d?.error || "La nota se guardó pero el aviso inmediato falló");
        } else {
          toast.success("Aviso inmediato enviado por correo");
        }
      }

      // create scheduled alarm if requested
      if (alarmEnabled && noteId) {
        const ares = await fetch(`/api/notes/${noteId}/alarm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fechaLimite: alarmFecha,
            diasAntelacion: alarmDias,
            emailsDestino: alarmEmails.trim(),
          }),
        });
        if (!ares.ok) {
          const d = await ares.json().catch(() => ({}));
          toast.error(d?.error || "La nota se guardó pero la alarma falló");
        } else {
          toast.success("Alarma programada por correo");
        }
      }

      toast.success(editingId ? "Nota actualizada" : "Nota creada");
      resetForm();
      fetchNotes();
    } catch {
      toast.error("Error al guardar la nota");
    } finally {
      setSaving(false);
    }
  };

  const deleteAlarm = async (id: string) => {
    if (!confirm("¿Eliminar esta alarma?")) return;
    try {
      const res = await fetch(`/api/alarms/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setExistingAlarms((prev) => prev.filter((a) => a.id !== id));
      toast.success("Alarma eliminada");
    } catch { toast.error("Error al eliminar la alarma"); }
  };

  const uploadFileToNote = async (noteId: string, file: File) => {
    const pres = await fetch(`/api/notes/${noteId}/files/presigned`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, contentType: file.type || "application/octet-stream" }),
    });
    if (!pres.ok) throw new Error();
    const { uploadUrl } = await pres.json();
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!put.ok) throw new Error();
  };

  const handleFiles = async (fileList: FileList | File[] | null) => {
    const selected = Array.from(fileList || []);
    if (selected.length === 0) return;
    // If the note doesn't exist yet, stage the files and upload them on save.
    if (!editingId) {
      setPendingFiles((prev) => [...prev, ...selected]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setUploading(true);
    let ok = 0;
    for (const file of selected) {
      try {
        await uploadFileToNote(editingId, file);
        ok++;
      } catch {
        toast.error(`No se pudo subir ${file.name}`);
      }
    }
    if (ok > 0) toast.success(ok === 1 ? "Archivo subido" : `${ok} archivos subidos`);
    await loadNoteDetail(editingId);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const onDropFiles = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const downloadFileFrom = async (noteId: string, fileId: string) => {
    try {
      const res = await fetch(`/api/notes/${noteId}/files/${fileId}/download`);
      if (!res.ok) throw new Error();
      const { url, filename } = await res.json();
      const a = document.createElement("a");
      a.href = url;
      if (filename) a.download = filename;
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch { toast.error("Error al descargar"); }
  };

  const downloadFile = async (fileId: string) => {
    if (!editingId) return;
    await downloadFileFrom(editingId, fileId);
  };

  const openFilesModal = async (n: Note) => {
    setFilesModalNote(n);
    setModalFiles([]);
    setModalLoading(true);
    try {
      const res = await fetch(`/api/notes/${n.id}`);
      const data = await res.json();
      setModalFiles(data?.note?.files || []);
    } catch {
      toast.error("Error al cargar los archivos");
    } finally {
      setModalLoading(false);
    }
  };

  const deleteFile = async (fileId: string) => {
    if (!editingId) return;
    if (!confirm("¿Eliminar este archivo?")) return;
    try {
      const res = await fetch(`/api/notes/${editingId}/files/${fileId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      toast.success("Archivo eliminado");
    } catch { toast.error("Error al eliminar el archivo"); }
  };

  const updateStatus = async (id: string, estado: Estado) => {
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
      });
      if (!res.ok) throw new Error();
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, estado } : n)));
    } catch { toast.error("Error al actualizar"); }
  };

  // Checkbox: complete a task (moves it to "Tareas completadas") or
  // un-complete it (returns it to "Seguimiento").
  const toggleCompleted = async (id: string) => {
    const nuevoEstado: Estado = isCompleted ? "PENDING" : "COMPLETED";
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      if (!res.ok) throw new Error();
      setNotes((prev) => prev.filter((n) => n.id !== id));
      toast.success(isCompleted ? "Devuelta a seguimiento" : "Tarea completada");
    } catch { toast.error("Error al actualizar"); }
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar esta nota?")) return;
    try {
      const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Nota eliminada");
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch { toast.error("Error al eliminar"); }
  };

  // ---- Mover una nota de seguimiento a otra sección ----
  // La nota de origen se marca como completada (sale de Seguimiento y queda
  // archivada en "Tareas completadas"; es reversible con el check).
  const archiveSourceNote = async (id: string) => {
    await fetch(`/api/notes/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "COMPLETED" }),
    });
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const moveToCompleted = async (n: Note) => {
    try {
      const res = await fetch(`/api/notes/${n.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: "COMPLETED" }),
      });
      if (!res.ok) throw new Error();
      setNotes((prev) => prev.filter((x) => x.id !== n.id));
      toast.success("Movida a Tareas completadas");
    } catch { toast.error("Error al mover la nota"); }
  };

  const moveToRC = async (n: Note) => {
    try {
      const descripcion = [n.titulo, n.descripcion].filter(Boolean).join("\n\n");
      const referencia = n.budget?.nombre || n.budget?.cliente || null;
      const res = await fetch(`/api/credit-retentions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descripcion, referencia }),
      });
      if (!res.ok) throw new Error();
      await archiveSourceNote(n.id);
      toast.success("Movida a Pendiente de RC");
    } catch { toast.error("Error al mover a Pendiente de RC"); }
  };

  const openMoveAlarm = (n: Note) => {
    setMoveAlarmNote(n);
    setMvFecha("");
    setMvDias(1);
    setMvEmails("jose.mora@localizandotudron.com");
  };

  const confirmMoveAlarm = async () => {
    if (!moveAlarmNote) return;
    if (!mvFecha) { toast.error("Indica la fecha límite de la alarma"); return; }
    if (!mvEmails.trim()) { toast.error("Indica al menos un email"); return; }
    setMvSaving(true);
    try {
      const res = await fetch(`/api/alarms`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: moveAlarmNote.titulo,
          descripcion: moveAlarmNote.descripcion || null,
          fechaLimite: mvFecha,
          diasAntelacion: mvDias,
          emailsDestino: mvEmails.trim(),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || "");
      }
      const noteId = moveAlarmNote.id;
      setMoveAlarmNote(null);
      await archiveSourceNote(noteId);
      toast.success("Movida a Alarmas");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Error al mover a Alarmas");
    } finally { setMvSaving(false); }
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-2 flex-wrap">
          <div className="relative flex-1 max-w-sm min-w-[180px]">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder={isCompleted ? "Buscar en completadas..." : "Buscar en seguimiento..."} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          {!isCompleted && (
            <select value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)}
              className="rounded-md border border-input bg-background px-3 text-sm">
              <option value="PENDING">Pendiente</option>
              <option value="DONE">Hecho</option>
              <option value="ATTEMPTED">Intentado</option>
              <option value="">Todas</option>
            </select>
          )}
          <div className="w-full sm:w-56">
            <CustomerCombobox
              value={filterCustomerId}
              initialLabel={filterCustomerLabel}
              onChange={(id, label) => { setFilterCustomerId(id); setFilterCustomerLabel(label ?? null); }}
              placeholder="Filtrar por cliente…"
            />
          </div>
        </div>
        {!showForm && !isCompleted && (
          <Button onClick={openNew} className="gap-2 bg-blue-600 hover:bg-blue-700 w-full sm:w-auto">
            <Plus className="h-4 w-4" /> Nueva Nota
          </Button>
        )}
      </div>

      {filterCustomerId && (
        <p className="text-sm text-gray-500">
          Mostrando el historial de seguimiento de <strong>{filterCustomerLabel}</strong>.
        </p>
      )}

      {filterBudgetId && (
        <div className="flex items-center gap-3 text-sm rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2">
          <span className="text-blue-800 dark:text-blue-200">
            Mostrando el seguimiento del presupuesto{filterBudgetLabel ? <> <strong>{filterBudgetLabel}</strong></> : " seleccionado"}.
          </span>
          <button
            type="button"
            onClick={() => { setFilterBudgetId(null); setFilterBudgetLabel(null); }}
            className="text-blue-600 hover:text-blue-800 underline"
          >
            Quitar filtro
          </button>
        </div>
      )}

      {filterTenderId && (
        <div className="flex items-center gap-3 text-sm rounded-md bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 px-3 py-2">
          <span className="text-sky-800 dark:text-sky-200">
            Mostrando el seguimiento de la licitación{filterTenderLabel ? <> <strong>{filterTenderLabel}</strong></> : " seleccionada"}.
          </span>
          <button
            type="button"
            onClick={() => { setFilterTenderId(null); setFilterTenderLabel(null); }}
            className="text-sky-600 hover:text-sky-800 underline"
          >
            Quitar filtro
          </button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <Card className="p-4 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
          <form onSubmit={submit} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{editingId ? "Editar nota" : "Nueva nota"}</h3>
              <button type="button" onClick={resetForm} className="text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
            </div>
            <Input placeholder="Título de la nota..." value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
            <textarea placeholder="Descripción (opcional)..." value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
              rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            {/* Color */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-500">Color:</span>
              {COLORS.map((c) => (
                <button key={c.value} type="button" onClick={() => setColor(c.value)}
                  className={`w-6 h-6 rounded-full border-2 transition ${color === c.value ? "border-gray-900 dark:border-white scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c.dot }} title={c.name} />
              ))}
            </div>
            {/* Link */}
            <div className="flex flex-col sm:flex-row gap-2">
              <select value={linkType} onChange={(e) => { setLinkType(e.target.value as any); setLinkId(""); setLinkCustomerLabel(null); setLinkBudgetLabel(null); }}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="none">Sin vincular</option>
                <option value="customer">Vincular a cliente</option>
                <option value="budget">Vincular a presupuesto</option>
              </select>
              {linkType === "customer" && (
                <div className="flex-1 min-w-0">
                  <CustomerCombobox
                    value={linkId || null}
                    initialLabel={linkCustomerLabel}
                    onChange={(id, label) => { setLinkId(id || ""); setLinkCustomerLabel(label ?? null); }}
                    placeholder="Escribe para buscar cliente…"
                  />
                </div>
              )}
              {linkType === "budget" && (
                <div className="flex-1 min-w-0">
                  <BudgetCombobox
                    value={linkId || null}
                    initialLabel={linkBudgetLabel}
                    onChange={(id, label) => { setLinkId(id || ""); setLinkBudgetLabel(label ?? null); }}
                    placeholder="Escribe el nº de presupuesto…"
                  />
                </div>
              )}
            </div>

            {/* Alarm */}
            <div className="rounded-md border border-input bg-background/60 p-3 space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input type="checkbox" checked={avisoInmediato} onChange={(e) => setAvisoInmediato(e.target.checked)} />
                <Bell className="h-4 w-4 text-blue-500" /> Enviar un aviso inmediato ahora
              </label>
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input type="checkbox" checked={alarmEnabled} onChange={(e) => setAlarmEnabled(e.target.checked)} />
                <Bell className="h-4 w-4 text-amber-500" /> Programar alarma de preaviso
              </label>
              {alarmEnabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">Fecha límite</label>
                    <input type="datetime-local" value={alarmFecha} onChange={(e) => setAlarmFecha(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Días de antelación</label>
                    <input type="number" min={0} value={alarmDias} onChange={(e) => setAlarmDias(parseInt(e.target.value) || 0)}
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                  </div>
                </div>
              )}
              {alarmEnabled && (
                <p className="text-xs text-gray-400 leading-snug">
                  El preaviso se revisa una vez al día por la mañana (~8:15 h). Si lo configuras para
                  el mismo día o para el día siguiente, el correo saldrá en la próxima revisión
                  matinal, no a una hora exacta. Para un aviso puntual usa el aviso inmediato.
                </p>
              )}
              {(avisoInmediato || alarmEnabled) && (
                <div>
                  <label className="text-xs text-gray-500">Correos (separados por coma)</label>
                  <input type="text" value={alarmEmails} onChange={(e) => setAlarmEmails(e.target.value)}
                    placeholder="correo@ejemplo.com, otro@ejemplo.com"
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                </div>
              )}
              {existingAlarms.length > 0 && (
                <div className="space-y-1 pt-1">
                  <p className="text-xs text-gray-500">Alarmas activas:</p>
                  {existingAlarms.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 text-xs bg-amber-50 dark:bg-amber-900/10 rounded px-2 py-1">
                      <span className="flex items-center gap-1"><Bell className="h-3 w-3 text-amber-500" /> {fmtDate(a.fechaLimite)} · {a.emailsDestino}</span>
                      <button type="button" onClick={() => deleteAlarm(a.id)} className="text-red-500 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Files / documentos */}
            <div className="rounded-md border border-input bg-background/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-medium"><Paperclip className="h-4 w-4 text-gray-500" /> Archivos / documentos</span>
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onPickFile} />
                <Button type="button" variant="outline" size="sm" disabled={uploading}
                  onClick={() => fileInputRef.current?.click()} className="gap-1">
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} {editingId ? "Subir" : "Adjuntar"}
                </Button>
              </div>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
                onDrop={onDropFiles}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed px-3 py-4 text-center cursor-pointer transition-colors ${dragOver ? "border-blue-500 bg-blue-50 dark:bg-blue-900/10" : "border-input hover:border-blue-400"}`}
              >
                <Upload className="h-4 w-4 text-gray-400" />
                <p className="text-xs text-gray-500">Arrastra aquí tus archivos o haz clic para seleccionar (puedes elegir varios a la vez)</p>
              </div>
              {editingId ? (
                files.length === 0 ? (
                  <p className="text-xs text-gray-400">Sin archivos adjuntos.</p>
                ) : (
                  <div className="space-y-1">
                    {files.map((f) => (
                      <div key={f.id} className="flex items-center justify-between gap-2 text-xs bg-gray-50 dark:bg-gray-800/50 rounded px-2 py-1">
                        <span className="truncate flex items-center gap-1 min-w-0"><Paperclip className="h-3 w-3 flex-shrink-0" /> <span className="truncate">{f.filename}</span></span>
                        <span className="flex items-center gap-2 flex-shrink-0">
                          <button type="button" onClick={() => downloadFile(f.id)} className="text-blue-500 hover:text-blue-600" title="Descargar"><Download className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => deleteFile(f.id)} className="text-red-500 hover:text-red-600" title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button>
                        </span>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                pendingFiles.length === 0 ? (
                  <p className="text-xs text-gray-400">Adjunta archivos ahora; se subirán al crear la nota.</p>
                ) : (
                  <div className="space-y-1">
                    {pendingFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-xs bg-gray-50 dark:bg-gray-800/50 rounded px-2 py-1">
                        <span className="truncate flex items-center gap-1 min-w-0"><Paperclip className="h-3 w-3 flex-shrink-0" /> <span className="truncate">{f.name}</span></span>
                        <button type="button" onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-600 flex-shrink-0" title="Quitar"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={saving || !titulo.trim()} className="bg-blue-600 hover:bg-blue-700">
                {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear nota"}
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {/* List */}
      {loading ? (
        <p className="text-center text-gray-500 py-10">{isCompleted ? "Cargando completadas..." : "Cargando seguimiento..."}</p>
      ) : notes.length === 0 ? (
        <div className="text-center py-16">
          {isCompleted ? <CheckCircle2 className="h-10 w-10 mx-auto text-gray-300 mb-3" /> : <StickyNote className="h-10 w-10 mx-auto text-gray-300 mb-3" />}
          <p className="text-gray-500">{isCompleted ? "No hay tareas completadas todavía. Marca el check en una tarea de seguimiento. ✅" : "No hay notas todavía. ¡Crea la primera! 📌"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => {
            const S = STATUS[n.estado];
            const Icon = S.icon;
            return (
              <Card key={n.id} className={`p-4 border-l-4 ${n.color && colorBar[n.color] ? colorBar[n.color] : "border-l-gray-300"}`}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleCompleted(n.id)}
                        className={`flex-shrink-0 ${isCompleted ? "text-blue-600 hover:text-gray-400" : "text-gray-300 hover:text-blue-600"}`}
                        title={isCompleted ? "Quitar de completadas (volver a seguimiento)" : "Marcar como completada"}
                        aria-label={isCompleted ? "Devolver a seguimiento" : "Marcar como completada"}
                      >
                        {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                      </button>
                      <Icon className={`h-5 w-5 flex-shrink-0 ${S.cls}`} />
                      <p className={`font-medium text-gray-900 dark:text-white break-words ${isCompleted ? "line-through text-gray-500 dark:text-gray-400" : ""}`}>{n.titulo}</p>
                    </div>
                    {n.descripcion && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">{n.descripcion}</p>}
                    <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-500">
                      <span>{n.user?.name || "—"} • {new Date(n.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      {n.customer && (
                        <Link href={`/clientes/${n.customer.id}`} className="inline-flex items-center gap-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5">
                          <Users className="h-3 w-3" /> {n.customer.nombre}
                        </Link>
                      )}
                      {n.budget && (
                        <Link href={`/budgets/${n.budget.id}`} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5">
                          <FileSpreadsheet className="h-3 w-3" /> {n.budget.nombre || n.budget.cliente || "Presupuesto"}
                        </Link>
                      )}
                      {n.tender && (
                        <Link href={`/tenders/${n.tender.id}`} className="inline-flex items-center gap-1 rounded-full bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 px-2 py-0.5 max-w-[220px] truncate">
                          <SearchIcon className="h-3 w-3 flex-shrink-0" /> <span className="truncate">{n.tender.title}</span>
                        </Link>
                      )}
                      {n._count?.alarms ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5">
                          <Bell className="h-3 w-3" /> {n._count.alarms}
                        </span>
                      ) : null}
                      {n._count?.files ? (
                        <button
                          type="button"
                          onClick={() => openFilesModal(n)}
                          className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300 px-2 py-0.5 transition-colors cursor-pointer"
                          title="Ver archivos adjuntos"
                        >
                          <Paperclip className="h-3 w-3" /> {n._count.files}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap sm:flex-nowrap sm:flex-shrink-0 border-t sm:border-t-0 border-border/60 pt-2 sm:pt-0">
                    {!isCompleted && n.estado !== "DONE" && <button onClick={() => updateStatus(n.id, "DONE")} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-green-600" title="Hecho"><CheckCircle className="h-4 w-4" /></button>}
                    {!isCompleted && n.estado !== "ATTEMPTED" && <button onClick={() => updateStatus(n.id, "ATTEMPTED")} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-yellow-600" title="Intentado"><AlertCircle className="h-4 w-4" /></button>}
                    {!isCompleted && n.estado !== "PENDING" && <button onClick={() => updateStatus(n.id, "PENDING")} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700" title="Pendiente"><Clock className="h-4 w-4" /></button>}
                    {!isCompleted && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-indigo-600" title="Mover a…"><FolderInput className="h-4 w-4" /></button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Mover a…</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => moveToCompleted(n)}><CheckCircle2 className="h-4 w-4 mr-2 text-blue-600" /> Tareas completadas</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => moveToRC(n)}><Landmark className="h-4 w-4 mr-2 text-sky-600" /> Pendiente de RC</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openMoveAlarm(n)}><Bell className="h-4 w-4 mr-2 text-amber-500" /> Alarmas</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    <button onClick={() => openEdit(n)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-blue-600" title="Editar"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => remove(n.id)} className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-600" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Files viewer modal */}
      {filesModalNote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setFilesModalNote(null)}
        >
          <Card
            className="w-full max-w-md max-h-[80vh] overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h3 className="font-semibold flex items-center gap-2"><Paperclip className="h-4 w-4 text-gray-500" /> Archivos adjuntos</h3>
                <p className="text-sm text-gray-500 truncate mt-0.5">{filesModalNote.titulo}</p>
              </div>
              <button type="button" onClick={() => setFilesModalNote(null)} className="text-gray-400 hover:text-gray-700 flex-shrink-0"><X className="h-5 w-5" /></button>
            </div>
            {modalLoading ? (
              <div className="flex items-center justify-center py-8 text-gray-500"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…</div>
            ) : modalFiles.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Sin archivos adjuntos.</p>
            ) : (
              <div className="space-y-2">
                {modalFiles.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-3 text-sm bg-gray-50 dark:bg-gray-800/50 rounded-md px-3 py-2">
                    <span className="truncate flex items-center gap-2 min-w-0"><Paperclip className="h-4 w-4 flex-shrink-0 text-gray-400" /> <span className="truncate">{f.filename}</span></span>
                    <button type="button" onClick={() => downloadFileFrom(filesModalNote.id, f.id)} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 flex-shrink-0" title="Descargar"><Download className="h-4 w-4" /> Descargar</button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* "Mover a Alarmas" modal */}
      {moveAlarmNote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !mvSaving && setMoveAlarmNote(null)}
        >
          <Card className="w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h3 className="font-semibold flex items-center gap-2"><Bell className="h-4 w-4 text-amber-500" /> Mover a Alarmas</h3>
                <p className="text-sm text-gray-500 truncate mt-0.5">{moveAlarmNote.titulo}</p>
              </div>
              <button type="button" onClick={() => !mvSaving && setMoveAlarmNote(null)} className="text-gray-400 hover:text-gray-700 flex-shrink-0"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Fecha límite</label>
                <input type="datetime-local" value={mvFecha} onChange={(e) => setMvFecha(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Días de preaviso</label>
                <input type="number" min={0} value={mvDias} onChange={(e) => setMvDias(parseInt(e.target.value) || 0)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Emails de aviso</label>
                <input type="text" value={mvEmails} onChange={(e) => setMvEmails(e.target.value)}
                  placeholder="correo@ejemplo.com, otro@ejemplo.com"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <p className="text-xs text-gray-500">Se creará una alarma en la sección <strong>Alarmas</strong> y la nota quedará archivada en <strong>Tareas completadas</strong>.</p>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={confirmMoveAlarm} disabled={mvSaving} className="bg-amber-600 hover:bg-amber-700">
                {mvSaving ? "Moviendo..." : "Crear alarma"}
              </Button>
              <Button variant="outline" onClick={() => setMoveAlarmNote(null)} disabled={mvSaving}>Cancelar</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
