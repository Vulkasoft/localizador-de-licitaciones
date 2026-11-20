"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { Clock, CheckCircle, AlertCircle, Phone, ArrowRight, Plus, X } from "lucide-react";
import { toast } from "sonner";

interface Note {
  id: string;
  titulo: string;
  estado: "PENDING" | "DONE" | "ATTEMPTED" | "COMPLETED";
  createdAt: string;
  user: { name: string };
  budget: { id: string; nombre: string };
}

interface Budget {
  id: string;
  nombre: string;
  cliente: string;
}

export function DashboardNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedBudgetId, setSelectedBudgetId] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [creatingNote, setCreatingNote] = useState(false);

  useEffect(() => {
    fetchRecentNotes();
    fetchBudgets();
  }, []);

  const fetchBudgets = async () => {
    try {
      const response = await fetch("/api/budgets?limit=999");
      if (!response.ok) throw new Error("Failed to fetch budgets");
      const data = await response.json();
      setBudgets(data.budgets || []);
    } catch (error) {
      console.error("Error fetching budgets:", error);
    }
  };

  const fetchRecentNotes = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/budgets?limit=999");
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();

      // Flatten all notes from all budgets
      const allNotes: Note[] = [];
      for (const budget of data.budgets) {
        if (budget.notes) {
          budget.notes.forEach((note: any) => {
            allNotes.push({
              ...note,
              budget: { id: budget.id, nombre: budget.nombre },
            });
          });
        }
      }

      // Sort by date and take first 5
      const sortedNotes = allNotes
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .slice(0, 5);

      setNotes(sortedNotes);
    } catch (error) {
      console.error("Error fetching notes:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || !selectedBudgetId) {
      toast.error("Por favor completa todos los campos");
      return;
    }

    setCreatingNote(true);
    try {
      const response = await fetch(
        `/api/budgets/${selectedBudgetId}/notes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ titulo: noteTitle }),
        }
      );

      if (!response.ok) throw new Error("Failed to create note");

      toast.success("Nota creada");
      setNoteTitle("");
      setSelectedBudgetId("");
      setShowForm(false);
      await fetchRecentNotes();
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al crear nota");
    } finally {
      setCreatingNote(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "DONE":
        return <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />;
      case "ATTEMPTED":
        return <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />;
      case "COMPLETED":
        return <Phone className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
      case "PENDING":
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case "DONE":
        return "bg-green-100 dark:bg-green-900/20";
      case "ATTEMPTED":
        return "bg-yellow-100 dark:bg-yellow-900/20";
      case "COMPLETED":
        return "bg-blue-100 dark:bg-blue-900/20";
      case "PENDING":
      default:
        return "bg-gray-100 dark:bg-gray-800";
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle>📝 Notas Recientes</CardTitle>
          <div className="flex gap-2">
            {!showForm && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowForm(true)}
                className="gap-1 border-blue-200 hover:bg-blue-50 dark:border-blue-800 dark:hover:bg-blue-900/20"
                title="Crear nota"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
            <Link href="/notes">
              <Button size="sm" variant="ghost" className="gap-1">
                Ver todas
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        </div>
      </CardHeader>

      {/* Formulario para crear nota */}
      {showForm && (
        <div className="px-6 pb-4 border-b border-gray-200 dark:border-gray-700">
          <form onSubmit={handleCreateNote} className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                Seleccionar Presupuesto
              </label>
              <select
                value={selectedBudgetId}
                onChange={(e) => setSelectedBudgetId(e.target.value)}
                className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-white"
                required
              >
                <option value="">-- Seleccionar --</option>
                {budgets.map((budget) => (
                  <option key={budget.id} value={budget.id}>
                    {budget.cliente} - {budget.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                Nota
              </label>
              <Input
                placeholder="Ej: Seguimiento requerido..."
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                className="w-full text-sm"
                required
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={creatingNote || !noteTitle.trim() || !selectedBudgetId}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-sm"
                size="sm"
              >
                {creatingNote ? "Creando..." : "Crear"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setNoteTitle("");
                  setSelectedBudgetId("");
                }}
                className="flex-1 text-sm"
                size="sm"
              >
                Cancelar
              </Button>
            </div>
          </form>
        </div>
      )}

      <CardContent className="flex-1 overflow-y-auto max-h-[320px]">
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Cargando...</p>
        ) : notes.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No hay notas aún
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              Crea una nota para empezar
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notes.map((note) => (
              <Link
                key={note.id}
                href={`/budgets/${note.budget.id}`}
                className="block"
              >
                <div
                  className={`p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${getStatusBg(
                    note.estado
                  )}`}
                >
                  <div className="flex items-start gap-2">
                    {getStatusIcon(note.estado)}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs text-gray-900 dark:text-white truncate">
                        {note.titulo}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 truncate">
                        {note.budget.nombre}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                        {note.user.name} • {new Date(note.createdAt).toLocaleDateString("es-ES", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
