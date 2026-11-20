"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Plus, X, Clock, MapPin } from "lucide-react";
import { toast } from "sonner";

interface Event {
  id: string;
  titulo: string;
  descripcion?: string;
  fechaHora: string;
  lugar?: string;
  user: { name: string };
}

export function CalendarWithEvents() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    titulo: "",
    descripcion: "",
    lugar: "",
    hora: "09:00",
  });
  const [loading, setLoading] = useState(false);

  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];

  const dayNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sab", "Dom"];

  const syncingRef = useRef(false);

  const fetchEvents = useCallback(async () => {
    try {
      const mes = currentDate.getMonth();
      const anio = currentDate.getFullYear();
      const response = await fetch(`/api/events?mes=${mes}&anio=${anio}`);
      if (!response.ok) throw new Error("Failed to fetch events");
      const data = await response.json();
      // Safety net against any duplicate rows: collapse events that share the
      // same title + date-time (e.g. an event synced twice from Google).
      const seen = new Set<string>();
      const unique = (data.events || []).filter((ev: Event) => {
        const key = `${ev.titulo}__${new Date(ev.fechaHora).getTime()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setEvents(unique);
    } catch (error) {
      console.error("Error fetching events:", error);
    }
  }, [currentDate]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Silent auto-sync with Google Calendar: on mount, on tab focus, and on an
  // interval while the tab is visible. No toasts, no emails — fully in the
  // background. If anything changed, refresh the visible events.
  const autoSync = useCallback(async () => {
    if (syncingRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    syncingRef.current = true;
    try {
      const r = await fetch("/api/calendar/google/sync", { method: "POST" });
      if (r.ok) {
        const d = await r.json();
        const changed = (d?.pushed || 0) + (d?.imported || 0) + (d?.updated || 0) + (d?.deleted || 0);
        if (changed > 0) {
          await fetchEvents();
        }
      }
    } catch {
      // silent — connection may not be configured; ignore.
    } finally {
      syncingRef.current = false;
    }
  }, [fetchEvents]);

  useEffect(() => {
    autoSync();
    const interval = setInterval(autoSync, 15000);
    const onFocus = () => autoSync();
    const onVisibility = () => {
      if (document.visibilityState === "visible") autoSync();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [autoSync]);

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const prevMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1)
    );
  };

  const nextMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1)
    );
  };

  const handleSelectDate = (day: number) => {
    const selected = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    setSelectedDate(selected);
    setShowForm(true);
    setFormData({ titulo: "", descripcion: "", lugar: "", hora: "09:00" });
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.titulo || !selectedDate) {
      toast.error("Por favor completa el título y selecciona una fecha");
      return;
    }

    const [hours, minutes] = formData.hora.split(":").map(Number);
    const fechaHora = new Date(selectedDate);
    fechaHora.setHours(hours, minutes);

    setLoading(true);
    try {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: formData.titulo,
          descripcion: formData.descripcion,
          lugar: formData.lugar,
          fechaHora: fechaHora.toISOString(),
        }),
      });

      if (!response.ok) throw new Error("Failed to create event");

      toast.success("Evento creado");
      setFormData({ titulo: "", descripcion: "", lugar: "", hora: "09:00" });
      setShowForm(false);
      setSelectedDate(null);
      await fetchEvents();
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al crear evento");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm("¿Eliminar este evento?")) return;

    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete event");

      toast.success("Evento eliminado");
      await fetchEvents();
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al eliminar evento");
    }
  };

  const getEventsForDay = (day: number): Event[] => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    return events.filter((event) => {
      const eventDate = new Date(event.fechaHora);
      return (
        eventDate.getDate() === day &&
        eventDate.getMonth() === currentDate.getMonth() &&
        eventDate.getFullYear() === currentDate.getFullYear()
      );
    });
  };

  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === currentDate.getFullYear() &&
    today.getMonth() === currentDate.getMonth();

  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  const days = [];

  for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) {
    days.push(null);
  }

  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  return (
    <Card className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              {monthNames[currentDate.getMonth()]}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {currentDate.getFullYear()}
            </p>
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={prevMonth}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={nextMonth}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-2">
          {dayNames.map((day) => (
            <div
              key={day}
              className="text-center text-xs font-semibold text-gray-600 dark:text-gray-400 py-2"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-2">
          {days.map((day, idx) => {
            const isEmpty = day === null;
            const isToday =
              isCurrentMonth && day === today.getDate();
            const dayEvents = day ? getEventsForDay(day) : [];
            const isSelected = selectedDate && selectedDate.getDate() === day;

            return (
              <div
                key={idx}
                onClick={() => !isEmpty && handleSelectDate(day!)}
                className={`aspect-auto min-h-20 p-2 rounded-lg border transition-all cursor-pointer ${
                  isEmpty
                    ? "bg-transparent cursor-default border-transparent"
                    : isToday
                      ? "bg-blue-600 text-white border-blue-700 shadow-lg"
                      : isSelected
                        ? "bg-indigo-100 dark:bg-indigo-900/30 border-indigo-400 dark:border-indigo-600"
                        : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                }`}
              >
                {!isEmpty && (
                  <div className="space-y-1">
                    <p className={`text-sm font-medium ${
                      isToday ? "text-white" : "text-gray-900 dark:text-white"
                    }`}>
                      {day}
                    </p>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 2).map((event) => (
                        <div
                          key={event.id}
                          className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded truncate hover:bg-blue-200 dark:hover:bg-blue-900/70"
                          title={event.titulo}
                        >
                          {event.titulo}
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 px-1.5">
                          +{dayEvents.length - 2} más
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Form */}
        {showForm && selectedDate && (
          <div className="border-t border-blue-200 dark:border-blue-800 pt-4">
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-semibold text-gray-900 dark:text-white">
                📅 {selectedDate.toLocaleDateString("es-ES", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </h4>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowForm(false)}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form onSubmit={handleAddEvent} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Evento
                </label>
                <Input
                  placeholder="Ej: Reunión con empresa X"
                  value={formData.titulo}
                  onChange={(e) =>
                    setFormData({ ...formData, titulo: e.target.value })
                  }
                  className="w-full text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Hora
                  </label>
                  <Input
                    type="time"
                    value={formData.hora}
                    onChange={(e) =>
                      setFormData({ ...formData, hora: e.target.value })
                    }
                    className="w-full text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Lugar
                  </label>
                  <Input
                    placeholder="Ej: Oficina"
                    value={formData.lugar}
                    onChange={(e) =>
                      setFormData({ ...formData, lugar: e.target.value })
                    }
                    className="w-full text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Notas (Opcional)
                </label>
                <textarea
                  placeholder="Detalles adicionales..."
                  value={formData.descripcion}
                  onChange={(e) =>
                    setFormData({ ...formData, descripcion: e.target.value })
                  }
                  className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-white"
                  rows={2}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-sm"
                >
                  {loading ? "Creando..." : "Crear Evento"}
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

            {/* Events for selected day */}
            {getEventsForDay(selectedDate.getDate()).length > 0 && (
              <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-800">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-3">
                  Eventos este día:
                </p>
                <div className="space-y-2">
                  {getEventsForDay(selectedDate.getDate()).map((event) => (
                    <div
                      key={event.id}
                      className="p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 text-xs"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {event.titulo}
                          </p>
                          <div className="flex gap-2 mt-1 text-gray-600 dark:text-gray-400">
                            {event.lugar && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {event.lugar}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(event.fechaHora).toLocaleTimeString("es-ES", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteEvent(event.id)}
                          className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/20"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-gray-600 dark:text-gray-400 border-t border-blue-200 dark:border-blue-800 pt-4">
          📅 Hoy: {today.toLocaleDateString("es-ES", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </div>
      </div>
    </Card>
  );
}
