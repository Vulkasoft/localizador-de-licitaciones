"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Trash2, CheckCircle, Clock, AlertCircle, Phone, X,
  Bell, Calendar, Mail, ExternalLink, Loader2,
} from "lucide-react";
import { toast } from "sonner";

type Estado = "PENDING" | "DONE" | "ATTEMPTED" | "COMPLETED";

interface Note {
  id: string; titulo: string; descripcion?: string | null;
  estado: Estado; createdAt: string;
}

interface Alarm {
  id: string; titulo: string; fechaLimite: string; diasAntelacion: number;
  emailsDestino: string; estado: string;
}

const STATUS = {
  PENDING: { label: "Pendiente", icon: Clock, cls: "text-gray-400", bar: "border-l-gray-300" },
  DONE: { label: "Hecho", icon: CheckCircle, cls: "text-green-600", bar: "border-l-green-500" },
  ATTEMPTED: { label: "Intentado", icon: AlertCircle, cls: "text-yellow-600", bar: "border-l-yellow-500" },
  COMPLETED: { label: "Completado", icon: Phone, cls: "text-blue-600", bar: "border-l-blue-500" },
} as const;

const ALARM_STATUS_CLS: Record<string, string> = {
  ACTIVA: "text-green-600",
  ENVIADA: "text-blue-600",
  VENCIDA: "text-red-600",
  CANCELADA: "text-gray-400",
};

/**
 * Panel de seguimiento + alarmas para una licitación.
 * Permite crear una nota de seguimiento y programar una alarma por email,
 * ambas vinculadas a la licitación.
 */
export function TenderTracking({ tenderId, tenderTitle }: { tenderId: string; tenderTitle?: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [alarms, setAlarms] = useState<Alarm[]>([]);

  // note form
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // alarm form
  const [showAlarmForm, setShowAlarmForm] = useState(false);
  const [alarmTitulo, setAlarmTitulo] = useState("");
  const [alarmFecha, setAlarmFecha] = useState("");
  const [alarmDias, setAlarmDias] = useState(1);
  const [alarmEmails, setAlarmEmails] = useState("");
  const [savingAlarm, setSavingAlarm] = useState(false);

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/notes?tenderId=${tenderId}`);
      const data = await res.json();
      setNotes(data.notes || []);
    } catch { /* silent */ }
  }, [tenderId]);

  const fetchAlarms = useCallback(async () => {
    try {
      const res = await fetch(`/api/alarms?tenderId=${tenderId}&limit=100`);
      const data = await res.json();
      setAlarms(data.alarms || []);
    } catch { /* silent */ }
  }, [tenderId]);

  useEffect(() => { fetchNotes(); fetchAlarms(); }, [fetchNotes, fetchAlarms]);

  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: titulo.trim(), descripcion: descripcion.trim() || null, tenderId }),
      });
      if (!res.ok) throw new Error();
      toast.success("Seguimiento añadido");
      setTitulo(""); setDescripcion(""); setShowNoteForm(false);
      fetchNotes();
    } catch { toast.error("Error al añadir seguimiento"); }
    finally { setSavingNote(false); }
  };

  const updateStatus = async (id: string, estado: Estado) => {
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado }),
      });
      if (!res.ok) throw new Error();
      setNotes((p) => p.map((n) => (n.id === id ? { ...n, estado } : n)));
    } catch { toast.error("Error"); }
  };

  const removeNote = async (id: string) => {
    if (!confirm("¿Eliminar este seguimiento?")) return;
    try {
      const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setNotes((p) => p.filter((n) => n.id !== id));
    } catch { toast.error("Error al eliminar"); }
  };

  const addAlarm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alarmFecha) { toast.error("Indica la fecha límite"); return; }
    if (!alarmEmails.trim()) { toast.error("Indica al menos un email"); return; }
    setSavingAlarm(true);
    try {
      const res = await fetch("/api/alarms", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: alarmTitulo.trim() || `Alarma: ${tenderTitle || "Licitación"}`,
          fechaLimite: alarmFecha,
          diasAntelacion: alarmDias,
          emailsDestino: alarmEmails.trim(),
          tenderId,
        }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error); }
      toast.success("Alarma programada");
      setAlarmTitulo(""); setAlarmFecha(""); setAlarmDias(1); setAlarmEmails(""); setShowAlarmForm(false);
      fetchAlarms();
    } catch (err: any) { toast.error(err?.message || "Error al crear la alarma"); }
    finally { setSavingAlarm(false); }
  };

  const removeAlarm = async (id: string) => {
    if (!confirm("¿Eliminar esta alarma?")) return;
    try {
      const res = await fetch(`/api/alarms/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setAlarms((p) => p.filter((a) => a.id !== id));
    } catch { toast.error("Error al eliminar"); }
  };

  return (
    <div className="space-y-5">
      {/* ---- Seguimiento ---- */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">📝 Seguimiento</h3>
          <div className="flex items-center gap-2">
            <Link href={`/notes?tenderId=${tenderId}${tenderTitle ? `&tenderLabel=${encodeURIComponent(tenderTitle)}` : ""}`}
              className="inline-flex items-center gap-1 text-xs text-sky-600 hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> Ver todo
            </Link>
            {!showNoteForm && (
              <Button size="sm" onClick={() => setShowNoteForm(true)} className="gap-2 bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4" /> Nuevo
              </Button>
            )}
          </div>
        </div>

        {showNoteForm && (
          <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <form onSubmit={addNote} className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Nuevo seguimiento</span>
                <button type="button" onClick={() => setShowNoteForm(false)} className="text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
              </div>
              <Input placeholder="Título..." value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
              <textarea placeholder="Descripción (opcional)..." value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
                rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <Button type="submit" disabled={savingNote || !titulo.trim()} className="flex-1 bg-blue-600 hover:bg-blue-700">{savingNote ? "Guardando..." : "Agregar"}</Button>
                <Button type="button" variant="outline" onClick={() => setShowNoteForm(false)} className="flex-1">Cancelar</Button>
              </div>
            </form>
          </Card>
        )}

        <div className="space-y-2">
          {notes.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-4">Sin seguimiento aún.</p>
          ) : notes.map((n) => {
            const S = STATUS[n.estado];
            const Icon = S.icon;
            return (
              <div key={n.id} className={`rounded-lg border border-l-4 ${S.bar} bg-card p-3`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${S.cls}`} />
                      <p className="text-sm font-medium truncate">{n.titulo}</p>
                    </div>
                    {n.descripcion && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{n.descripcion}</p>}
                  </div>
                  <button onClick={() => removeNote(n.id)} className="text-gray-400 hover:text-red-600 flex-shrink-0" title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/50">
                  {n.estado !== "DONE" && <button onClick={() => updateStatus(n.id, "DONE")} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-green-600" title="Hecho"><CheckCircle className="h-3.5 w-3.5" /></button>}
                  {n.estado !== "ATTEMPTED" && <button onClick={() => updateStatus(n.id, "ATTEMPTED")} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-yellow-600" title="Intentado"><AlertCircle className="h-3.5 w-3.5" /></button>}
                  {n.estado !== "COMPLETED" && <button onClick={() => updateStatus(n.id, "COMPLETED")} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-blue-600" title="Completado"><Phone className="h-3.5 w-3.5" /></button>}
                  {n.estado !== "PENDING" && <button onClick={() => updateStatus(n.id, "PENDING")} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700" title="Pendiente"><Clock className="h-3.5 w-3.5" /></button>}
                  <span className={`ml-auto text-[11px] font-medium ${S.cls}`}>{S.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---- Alarmas ---- */}
      <div className="space-y-3 pt-4 border-t border-border/60">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold flex items-center gap-2"><Bell className="h-4 w-4 text-orange-500" /> Alarmas</h3>
          {!showAlarmForm && (
            <Button size="sm" onClick={() => setShowAlarmForm(true)} className="gap-2 bg-orange-500 hover:bg-orange-600">
              <Plus className="h-4 w-4" /> Nueva
            </Button>
          )}
        </div>

        {showAlarmForm && (
          <Card className="p-4 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
            <form onSubmit={addAlarm} className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Nueva alarma por email</span>
                <button type="button" onClick={() => setShowAlarmForm(false)} className="text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
              </div>
              <Input placeholder={`Título (opcional) — por defecto: Alarma: ${tenderTitle || "Licitación"}`} value={alarmTitulo} onChange={(e) => setAlarmTitulo(e.target.value)} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Fecha límite</label>
                  <Input type="date" value={alarmFecha} onChange={(e) => setAlarmFecha(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Días de antelación</label>
                  <Input type="number" min={0} value={alarmDias} onChange={(e) => setAlarmDias(parseInt(e.target.value) || 0)} />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Emails (separados por comas)</label>
                <Input placeholder="correo@ejemplo.com, otro@ejemplo.com" value={alarmEmails} onChange={(e) => setAlarmEmails(e.target.value)} />
              </div>
              <p className="text-[11px] text-muted-foreground">Recibirás un aviso diario por email desde {alarmDias} día(s) antes de la fecha límite.</p>
              <div className="flex gap-2">
                <Button type="submit" disabled={savingAlarm} className="flex-1 bg-orange-500 hover:bg-orange-600">{savingAlarm ? <Loader2 className="h-4 w-4 animate-spin" /> : "Programar alarma"}</Button>
                <Button type="button" variant="outline" onClick={() => setShowAlarmForm(false)} className="flex-1">Cancelar</Button>
              </div>
            </form>
          </Card>
        )}

        <div className="space-y-2">
          {alarms.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-4">Sin alarmas aún.</p>
          ) : alarms.map((a) => (
            <div key={a.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{a.titulo}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(a.fechaLimite).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })}</span>
                    <span className="flex items-center gap-1"><Mail className="h-3 w-3" /><span className="truncate max-w-[160px]">{a.emailsDestino}</span></span>
                    <span className={`font-medium ${ALARM_STATUS_CLS[a.estado] || "text-gray-500"}`}>{a.estado}</span>
                  </div>
                </div>
                <button onClick={() => removeAlarm(a.id)} className="text-gray-400 hover:text-red-600 flex-shrink-0" title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
