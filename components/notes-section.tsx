"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, CheckCircle, Clock, AlertCircle, Phone, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface Note {
  id: string;
  titulo: string;
  descripcion?: string;
  estado: "PENDING" | "DONE" | "ATTEMPTED" | "COMPLETED";
  createdAt: string;
  user: {
    name: string;
  };
}

interface NotesSectionProps {
  budgetId: string;
}

export function NotesSection({ budgetId }: NotesSectionProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchNotes();
  }, [budgetId]);

  const fetchNotes = async () => {
    try {
      const response = await fetch(`/api/budgets/${budgetId}/notes`);
      if (!response.ok) throw new Error("Failed to fetch notes");
      const data = await response.json();
      setNotes(data.notes || []);
    } catch (error) {
      console.error("Error fetching notes:", error);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/budgets/${budgetId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: newNote }),
      });

      if (!response.ok) throw new Error("Failed to add note");

      toast.success("Nota agregada");
      setNewNote("");
      setShowForm(false);
      await fetchNotes();
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al agregar nota");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (noteId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/budgets/${budgetId}/notes/${noteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: newStatus }),
      });

      if (!response.ok) throw new Error("Failed to update note");

      toast.success("Nota actualizada");
      await fetchNotes();
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al actualizar nota");
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm("¿Eliminar esta nota?")) return;

    try {
      const response = await fetch(`/api/budgets/${budgetId}/notes/${noteId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete note");

      toast.success("Nota eliminada");
      await fetchNotes();
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al eliminar nota");
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "DONE":
        return <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />;
      case "ATTEMPTED":
        return <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />;
      case "COMPLETED":
        return <Phone className="h-5 w-5 text-blue-600 dark:text-blue-400" />;
      case "PENDING":
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "DONE":
        return "Hecho";
      case "ATTEMPTED":
        return "Intentado (sin respuesta)";
      case "COMPLETED":
        return "Completado";
      case "PENDING":
      default:
        return "Pendiente";
    }
  };

  const getStatusColor = (status: string) => {
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">📝 Notas</h3>
        <div className="flex items-center gap-2">
          <Link
            href={`/notes?budgetId=${budgetId}`}
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 underline"
          >
            <ExternalLink className="h-4 w-4" />
            Ver en Seguimiento
          </Link>
          {!showForm && (
            <Button
              size="sm"
              onClick={() => setShowForm(true)}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Nueva Nota
            </Button>
          )}
        </div>
      </div>

      {/* Add note form */}
      {showForm && (
        <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <form onSubmit={handleAddNote} className="space-y-3">
            <Input
              placeholder="Ej: Llamar al Ayuntamiento de Mogán..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="w-full"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={loading || !newNote.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {loading ? "Agregando..." : "Agregar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowForm(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Notes list */}
      <div className="space-y-3">
        {notes.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-400 py-8">
            No hay notas aún. ¡Crea una nueva! 📌
          </p>
        ) : (
          notes.map((note) => (
            <Card
              key={note.id}
              className={`p-4 border-l-4 ${
                note.estado === "DONE"
                  ? "border-l-green-600"
                  : note.estado === "ATTEMPTED"
                    ? "border-l-yellow-600"
                    : note.estado === "COMPLETED"
                      ? "border-l-blue-600"
                      : "border-l-gray-400"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {getStatusIcon(note.estado)}
                    <p className="font-medium text-gray-900 dark:text-white">
                      {note.titulo}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span>
                      {note.user.name} •{" "}
                      {new Date(note.createdAt).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Status buttons */}
                  <div className="flex gap-1">
                    {note.estado !== "DONE" && (
                      <button
                        onClick={() => handleUpdateStatus(note.id, "DONE")}
                        className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-green-600"
                        title="Marcar hecho"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </button>
                    )}
                    {note.estado !== "ATTEMPTED" && (
                      <button
                        onClick={() => handleUpdateStatus(note.id, "ATTEMPTED")}
                        className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-yellow-600"
                        title="Intentado sin respuesta"
                      >
                        <AlertCircle className="h-4 w-4" />
                      </button>
                    )}
                    {note.estado !== "COMPLETED" && (
                      <button
                        onClick={() => handleUpdateStatus(note.id, "COMPLETED")}
                        className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-blue-600"
                        title="Completado"
                      >
                        <Phone className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={() => handleDeleteNote(note.id)}
                    className="p-2 rounded hover:bg-red-100 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-600"
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
