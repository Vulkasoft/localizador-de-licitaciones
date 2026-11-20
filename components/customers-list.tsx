"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Users, FileSpreadsheet, StickyNote, X, Building2 } from "lucide-react";
import { toast } from "sonner";
import { validateSpanishNif } from "@/lib/nif";

export const CUSTOMER_COLORS: Record<string, string> = {
  amber: "#f59e0b", green: "#16a34a", blue: "#2563eb", red: "#dc2626", purple: "#9333ea", teal: "#0d9488",
};

interface Customer {
  id: string; nombre: string; nif?: string | null; email?: string | null;
  ciudad?: string | null; provincia?: string | null; telefono?: string | null; movil?: string | null;
  etiqueta?: string | null; color?: string | null;
  _count?: { budgets: number; tenders: number; notes: number };
}

export function CustomersList() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [nif, setNif] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [provincia, setProvincia] = useState("");
  const [direccion, setDireccion] = useState("");
  const [codigoPostal, setCodigoPostal] = useState("");
  const [saving, setSaving] = useState(false);
  const [nifError, setNifError] = useState<string | null>(null);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ withCounts: "true" });
      if (search) p.set("search", search);
      if (etiqueta) p.set("etiqueta", etiqueta);
      const res = await fetch(`/api/customers?${p.toString()}`);
      const data = await res.json();
      setCustomers(Array.isArray(data) ? data : []);
    } catch { toast.error("Error al cargar clientes"); }
    finally { setLoading(false); }
  }, [search, etiqueta]);

  useEffect(() => { const t = setTimeout(fetchCustomers, 250); return () => clearTimeout(t); }, [fetchCustomers]);

  useEffect(() => {
    fetch("/api/customers?distinctTags=true").then(r => r.json()).then((d) => {
      if (Array.isArray(d?.tags)) setTags(d.tags);
    }).catch(() => {});
  }, []);

  const createCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) { toast.error("Introduce el nombre del cliente"); return; }
    const check = validateSpanishNif(nif);
    if (!check.valid) {
      setNifError(check.message || "El NIF/CIF no es válido.");
      toast.error(check.message || "El NIF/CIF no es válido para Contasimple.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombre.trim(), nif: nif.trim(), email: email || null, telefono: telefono || null, ciudad: ciudad || null, provincia: provincia || null, direccion: direccion || null, codigoPostal: codigoPostal || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.field === "nif") setNifError(data?.error || "NIF/CIF no válido para Contasimple.");
        toast.error(data?.error || "Error al crear cliente");
        setSaving(false);
        return;
      }
      if (data?.contasimpleErrors?.length) {
        toast.warning(`Cliente creado. No se pudo crear en Contasimple: ${data.contasimpleErrors.join(", ")}`);
      } else {
        toast.success("Cliente creado en la aplicación y en Contasimple (Península y Canarias)");
      }
      setNombre(""); setNif(""); setEmail(""); setTelefono(""); setCiudad(""); setProvincia(""); setDireccion(""); setCodigoPostal(""); setNifError(null); setShowForm(false);
      fetchCustomers();
    } catch { toast.error("Error al crear cliente"); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-2 flex-wrap items-center">
          <div className="relative flex-1 max-w-md min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Buscar por nombre, NIF o email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <select value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="">Todas las etiquetas</option>
            {tags.map((t) => (<option key={t} value={t}>{t}</option>))}
          </select>
          {etiqueta && (
            <button type="button" onClick={() => setEtiqueta("")} className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1">
              <X className="h-3.5 w-3.5" /> Quitar filtro
            </button>
          )}
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)} className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Nuevo Cliente
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="p-4 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
          <form onSubmit={createCustomer} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Nuevo cliente</h3>
              <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input placeholder="Nombre / Organización *" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
              <div>
                <Input placeholder="NIF / CIF *" value={nif} onChange={(e) => { setNif(e.target.value); setNifError(null); }} className={nifError ? "border-red-500" : ""} />
                {nifError && <p className="text-xs text-red-600 mt-1">{nifError}</p>}
              </div>
              <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input placeholder="Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
              <Input placeholder="Ciudad" value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
              <Input placeholder="Provincia" value={provincia} onChange={(e) => setProvincia(e.target.value)} />
              <Input placeholder="Dirección" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
              <Input placeholder="Código postal" value={codigoPostal} onChange={(e) => setCodigoPostal(e.target.value)} />
            </div>
            <p className="text-xs text-gray-500">El cliente se creará también en Contasimple en las dos sedes (Península y Canarias). El NIF/CIF es obligatorio y debe ser válido; si no, no se podrá guardar.</p>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving || !nombre.trim() || !nif.trim()} className="bg-blue-600 hover:bg-blue-700">{saving ? "Guardando..." : "Crear cliente"}</Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <p className="text-center text-gray-500 py-10">Cargando clientes…</p>
      ) : customers.length === 0 ? (
        <div className="text-center py-16">
          <Users className="h-10 w-10 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No hay clientes. Créalos aquí o impórtalos desde Contasimple.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {customers.map((c) => (
            <Link key={c.id} href={`/clientes/${c.id}`}>
              <Card className="p-4 h-full hover:shadow-md transition cursor-pointer border-l-4"
                style={{ borderLeftColor: c.color && CUSTOMER_COLORS[c.color] ? CUSTOMER_COLORS[c.color] : "#e2e8f0" }}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white truncate">{c.nombre}</p>
                    {c.nif && <p className="text-xs text-gray-500">{c.nif}</p>}
                    {(c.ciudad || c.provincia) && <p className="text-xs text-gray-500 truncate">{[c.ciudad, c.provincia].filter(Boolean).join(", ")}</p>}
                    {c.etiqueta && <span className="inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">{c.etiqueta}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1"><FileSpreadsheet className="h-3.5 w-3.5" /> {c._count?.budgets ?? 0}</span>
                  <span className="inline-flex items-center gap-1"><Search className="h-3.5 w-3.5" /> {c._count?.tenders ?? 0}</span>
                  <span className="inline-flex items-center gap-1"><StickyNote className="h-3.5 w-3.5" /> {c._count?.notes ?? 0}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
