"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { Clock, CheckCircle, AlertCircle, Phone } from "lucide-react";

interface Note {
  id: string;
  titulo: string;
  estado: "PENDING" | "DONE" | "ATTEMPTED" | "COMPLETED";
  createdAt: string;
  user: { name: string };
  budget: { id: string; nombre: string };
}

export function AllNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAllNotes();
  }, []);

  const fetchAllNotes = async () => {
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

      // Sort by date (newest first)
      const sortedNotes = allNotes.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setNotes(sortedNotes);
    } catch (error) {
      console.error("Error fetching notes:", error);
    } finally {
      setLoading(false);
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

  const getStatusBg = (status: string) => {
    switch (status) {
      case "DONE":
        return "bg-green-100 dark:bg-green-900/20 border-l-4 border-l-green-600";
      case "ATTEMPTED":
        return "bg-yellow-100 dark:bg-yellow-900/20 border-l-4 border-l-yellow-600";
      case "COMPLETED":
        return "bg-blue-100 dark:bg-blue-900/20 border-l-4 border-l-blue-600";
      case "PENDING":
      default:
        return "bg-gray-100 dark:bg-gray-800 border-l-4 border-l-gray-400";
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

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Cargando notas...</p>
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <Card className="p-12 text-center">
        <p className="text-lg text-gray-500 dark:text-gray-400">No hay notas aún</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
          Crea notas en los presupuestos para verlas aquí
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Total: <span className="font-semibold">{notes.length}</span> notas
      </p>

      <div className="space-y-3">
        {notes.map((note) => (
          <Link
            key={note.id}
            href={`/budgets/${note.budget.id}`}
            className="block"
          >
            <Card
              className={`p-4 hover:shadow-md transition-shadow cursor-pointer ${
                getStatusBg(note.estado)
              }`}
            >
              <div className="flex items-start gap-4">
                {getStatusIcon(note.estado)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900 dark:text-white text-lg">
                        {note.titulo}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Presupuesto: <span className="font-medium">{note.budget.nombre}</span>
                      </p>
                      <div className="flex items-center gap-4 mt-3 text-xs text-gray-600 dark:text-gray-400">
                        <span>
                          {note.user.name}
                        </span>
                        <span>
                          {new Date(note.createdAt).toLocaleDateString("es-ES", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                        {getStatusLabel(note.estado)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
