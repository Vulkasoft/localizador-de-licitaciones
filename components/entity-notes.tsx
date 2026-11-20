"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, CheckCircle, Clock, AlertCircle, Phone, X } from "lucide-react";
import { toast } from "sonner";

type Estado = "PENDING" | "DONE" | "ATTEMPTED" | "COMPLETED";
interface Note {
  id: string; titulo: string; descripcion?: string | null; color?: string | null;
  estado: Estado; createdAt: string; user?: { name?: string | null };
}

const STATUS = {
  PENDING: { label: "Pendiente", icon: Clock, cls: "text-gray-400", bar: "border-l-gray-300" },
  DONE: { label: "Hecho", icon: CheckCircle, cls: "text-green-600", bar: "border-l-green-500" },
  ATTEMPTED: { label: "Intentado", icon: AlertCircle, cls: "text-yellow-600", bar: "border-l-yellow-500" },
  COMPLETED: { label: "Completado", icon: Phone, cls: "text-blue-600", bar: "border-l-blue-500" },
} as const;

/**
 * Reusable notes panel. Pass exactly one of customerId / tenderId / budgetId.
 */
export function EntityNotes({
  customerId, tenderId, budgetId, title = "📝 Notas", compact = false,
}: {
  customerId?: string; tenderId?: string; budgetId?: string; title?: string; compact?: boolean;
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [saving, setSaving] = useState(false);

  const query = customerId ? `customerId=${customerId}` : tenderId ? `tenderId=${tenderId}` : `budgetId=${budgetId}`;
  const linkPayload = () => ({
    customerId: customerId || null, tenderId: tenderId || null, budgetId: budgetId || null,
  });

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/notes?${query}`);
      const data = await res.json();
      setNotes(data.notes || []);
    } catch { /* silent */ }
  }, [query]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: titulo.trim(), descripcion: descripcion.trim() || null, ...linkPayload() }),
      });
      if (!res.ok) throw new Error();
      toast.success("Nota añadida");
      setTitulo(""); setDescripcion(""); setShowForm(false);
      fetchNotes();
    } catch { toast.error("Error al añadir nota"); }
    finally { setSaving(false); }
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

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar esta nota?")) return;
    try {
      const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setNotes((p) => p.filter((n) => n.id !== id));
    } catch { toast.error("Error al eliminar"); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)} className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Nueva Nota
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <form onSubmit={add} className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Nueva nota</span>
              <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
            </div>
            <Input placeholder="Título..." value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
            <textarea placeholder="Descripción (opcional)..." value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
              rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <Button type="submit" disabled={saving || !titulo.trim()} className="flex-1 bg-blue-600 hover:bg-blue-700">{saving ? "Guardando..." : "Agregar"}</Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1">Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="space-y-2">
        {notes.length === 0 ? (
          <p className="text-center text-sm text-gray-500 py-6">No hay notas aún.</p>
        ) : notes.map((n) => {
          const S = STATUS[n.estado]; const Icon = S.icon;
          return (
            <Card key={n.id} className={`p-3 border-l-4 ${S.bar}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 flex-shrink-0 ${S.cls}`} />
                    <p className="font-medium text-sm break-words">{n.titulo}</p>
                  </div>
                  {n.descripcion && <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">{n.descripcion}</p>}
                  <p className="text-[11px] text-gray-400 mt-1">{n.user?.name || "—"} • {new Date(n.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  {n.estado !== "DONE" && <button onClick={() => updateStatus(n.id, "DONE")} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-green-600" title="Hecho"><CheckCircle className="h-4 w-4" /></button>}
                  {n.estado !== "ATTEMPTED" && <button onClick={() => updateStatus(n.id, "ATTEMPTED")} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-yellow-600" title="Intentado"><AlertCircle className="h-4 w-4" /></button>}
                  {n.estado !== "COMPLETED" && <button onClick={() => updateStatus(n.id, "COMPLETED")} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-blue-600" title="Completado"><Phone className="h-4 w-4" /></button>}
                  <button onClick={() => remove(n.id)} className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-600" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
