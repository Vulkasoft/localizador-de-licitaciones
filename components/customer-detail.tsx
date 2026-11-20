"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EntityNotes } from "@/components/entity-notes";
import { CUSTOMER_COLORS } from "@/components/customers-list";
import { validateSpanishNif } from "@/lib/nif";
import {
  ArrowLeft, Building2, Mail, Phone, MapPin, FileSpreadsheet, Search as SearchIcon,
  StickyNote, Pencil, Check, X, Clock, FileText, Trash2, Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface Detail {
  customer: any; budgets: any[]; tenders: any[]; notes: any[];
  totals: { budgets: number; tenders: number; notes: number; notesPendientes: number };
}

const COLOR_KEYS = Object.keys(CUSTOMER_COLORS);

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

interface FormState {
  nombre: string; nif: string; email: string; telefono: string; movil: string;
  direccion: string; ciudad: string; provincia: string; codigoPostal: string; notas: string;
}

const emptyForm: FormState = {
  nombre: "", nif: "", email: "", telefono: "", movil: "",
  direccion: "", ciudad: "", provincia: "", codigoPostal: "", notas: "",
};

export function CustomerDetail({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);       // etiqueta/color editor
  const [etiqueta, setEtiqueta] = useState("");
  const [color, setColor] = useState("");
  const [tab, setTab] = useState<"resumen" | "presupuestos" | "licitaciones" | "notas">("resumen");

  // Full edit form (syncs to Contasimple)
  const [editForm, setEditForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [nifError, setNifError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteScope, setDeleteScope] = useState<"app" | "contasimple" | "both">("app");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/customers/${customerId}`);
      if (!res.ok) throw new Error();
      const d = await res.json();
      setData(d);
      setEtiqueta(d.customer?.etiqueta || "");
      setColor(d.customer?.color || "");
    } catch { toast.error("Error al cargar el cliente"); }
    finally { setLoading(false); }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const saveTags = async () => {
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etiqueta: etiqueta || null, color: color || null }),
      });
      if (!res.ok) throw new Error();
      toast.success("Cliente actualizado");
      setEditing(false);
      load();
    } catch { toast.error("Error al guardar"); }
  };

  const openEditForm = () => {
    const c = data!.customer;
    setForm({
      nombre: c.nombre || "", nif: c.nif || "", email: c.email || "", telefono: c.telefono || "",
      movil: c.movil || "", direccion: c.direccion || "", ciudad: c.ciudad || "",
      provincia: c.provincia || "", codigoPostal: c.codigoPostal || "", notas: c.notas || "",
    });
    setNifError(null);
    setEditForm(true);
  };

  const upd = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (k === "nif") setNifError(null);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) { toast.error("Introduce el nombre del cliente"); return; }
    const check = validateSpanishNif(form.nif);
    if (!check.valid) {
      setNifError(check.message || "El NIF/CIF no es válido.");
      toast.error(check.message || "El NIF/CIF no es válido para Contasimple.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          nif: form.nif.trim(),
          email: form.email.trim() || null,
          telefono: form.telefono.trim() || null,
          movil: form.movil.trim() || null,
          direccion: form.direccion.trim() || null,
          ciudad: form.ciudad.trim() || null,
          provincia: form.provincia.trim() || null,
          codigoPostal: form.codigoPostal.trim() || null,
          notas: form.notas.trim() || null,
          syncToContasimple: true,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d?.field === "nif") setNifError(d?.error || "NIF/CIF no válido para Contasimple.");
        toast.error(d?.error || "Error al guardar el cliente");
        setSaving(false);
        return;
      }
      if (d?.contasimpleErrors?.length) {
        toast.warning(`Guardado, pero no se pudo actualizar en Contasimple (${d.contasimpleErrors.join(", ")}).`);
      } else {
        toast.success("Cliente actualizado en la aplicación y en Contasimple");
      }
      setEditForm(false);
      load();
    } catch {
      toast.error("Error al guardar el cliente");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/customers/${customerId}?scope=${deleteScope}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d?.error || "Error al eliminar el cliente");
        setDeleting(false);
        return;
      }
      if (deleteScope === "contasimple") {
        toast.success("Cliente eliminado en Contasimple");
        setConfirmDelete(false);
        setDeleting(false);
        load();
        return;
      }
      toast.success(deleteScope === "both" ? "Cliente eliminado en la aplicación y en Contasimple" : "Cliente eliminado de la aplicación");
      router.push("/clientes");
    } catch {
      toast.error("Error al eliminar el cliente");
      setDeleting(false);
    }
  };

  const hasContasimple = !!(data?.customer?.contasimpleIdPeninsula || data?.customer?.contasimpleIdCanarias);

  if (loading) return <p className="text-center text-gray-500 py-16">Cargando…</p>;
  if (!data) return <p className="text-center text-gray-500 py-16">Cliente no encontrado.</p>;

  const c = data.customer;

  // Build timeline
  const timeline = [
    ...data.budgets.map((b) => ({ type: "budget", date: b.createdAt, label: b.nombre || b.cliente || "Presupuesto", id: b.id })),
    ...data.tenders.map((t) => ({ type: "tender", date: t.createdAt, label: t.title, id: t.id })),
    ...data.notes.map((n) => ({ type: "note", date: n.createdAt, label: n.titulo, id: n.id })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 15);

  const inputCls = "w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40";

  return (
    <div className="space-y-6">
      <Link href="/clientes"><Button variant="outline" size="sm" className="gap-2"><ArrowLeft className="h-4 w-4" /> Clientes</Button></Link>

      {/* Full edit form */}
      {editForm && (
        <Card className="p-5 border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-900/10">
          <form onSubmit={saveEdit} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Editar cliente</h3>
              <button type="button" onClick={() => setEditForm(false)} className="text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-500">Nombre / Organización *</label>
                <input value={form.nombre} onChange={upd("nombre")} placeholder="Nombre / Organización *" className={inputCls} autoFocus />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-500">NIF / CIF * (obligatorio para Contasimple)</label>
                <input value={form.nif} onChange={upd("nif")} placeholder="NIF / CIF *"
                  className={`${inputCls} ${nifError ? "border-red-500 focus:ring-red-500/40" : ""}`} />
                {nifError && <p className="text-xs text-red-600 mt-1">{nifError}</p>}
              </div>
              <div><label className="text-xs text-gray-500">Email</label><input value={form.email} onChange={upd("email")} placeholder="Email" className={inputCls} /></div>
              <div><label className="text-xs text-gray-500">Teléfono</label><input value={form.telefono} onChange={upd("telefono")} placeholder="Teléfono" className={inputCls} /></div>
              <div><label className="text-xs text-gray-500">Móvil</label><input value={form.movil} onChange={upd("movil")} placeholder="Móvil" className={inputCls} /></div>
              <div><label className="text-xs text-gray-500">Código postal</label><input value={form.codigoPostal} onChange={upd("codigoPostal")} placeholder="Código postal" className={inputCls} /></div>
              <div className="sm:col-span-2"><label className="text-xs text-gray-500">Dirección</label><input value={form.direccion} onChange={upd("direccion")} placeholder="Dirección" className={inputCls} /></div>
              <div><label className="text-xs text-gray-500">Ciudad</label><input value={form.ciudad} onChange={upd("ciudad")} placeholder="Ciudad" className={inputCls} /></div>
              <div><label className="text-xs text-gray-500">Provincia</label><input value={form.provincia} onChange={upd("provincia")} placeholder="Provincia" className={inputCls} /></div>
              <div className="sm:col-span-2"><label className="text-xs text-gray-500">Notas</label><textarea value={form.notas} onChange={upd("notas")} placeholder="Notas" rows={2} className={inputCls} /></div>
            </div>
            <p className="text-xs text-gray-500">Los cambios se guardarán también en Contasimple (Península y Canarias). Si el NIF/CIF no es válido no se podrá guardar.</p>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving} className="gap-1 bg-blue-600 hover:bg-blue-700">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar cambios
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditForm(false)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Header */}
      <Card className="p-6 border-l-4" style={{ borderLeftColor: color && CUSTOMER_COLORS[color] ? CUSTOMER_COLORS[color] : "#e2e8f0" }}>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <Building2 className="h-7 w-7 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{c.nombre}</h1>
              {c.nif && <p className="text-sm text-gray-500">{c.nif}</p>}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-600 dark:text-gray-400">
                {c.email && <span className="inline-flex items-center gap-1"><Mail className="h-4 w-4" /> {c.email}</span>}
                {(c.telefono || c.movil) && <span className="inline-flex items-center gap-1"><Phone className="h-4 w-4" /> {c.telefono || c.movil}</span>}
                {(c.ciudad || c.provincia) && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" /> {[c.ciudad, c.provincia].filter(Boolean).join(", ")}</span>}
              </div>
              {c.etiqueta && !editing && <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">{c.etiqueta}</span>}
            </div>
          </div>
          {!editing ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={openEditForm}><Pencil className="h-4 w-4" /> Editar</Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditing(true)}><StickyNote className="h-4 w-4" /> Etiqueta</Button>
              <Button variant="outline" size="sm" className="gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-900" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" /> Eliminar</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 min-w-[220px]">
              <Input placeholder="Etiqueta (ej: VIP, Ayuntamiento...)" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} />
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setColor("")} className={`w-6 h-6 rounded-full border-2 ${color === "" ? "border-gray-900 dark:border-white" : "border-transparent"}`} style={{ background: "#cbd5e1" }} title="Ninguno" />
                {COLOR_KEYS.map((k) => (
                  <button key={k} type="button" onClick={() => setColor(k)} className={`w-6 h-6 rounded-full border-2 ${color === k ? "border-gray-900 dark:border-white scale-110" : "border-transparent"}`} style={{ background: CUSTOMER_COLORS[k] }} />
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveTags} className="gap-1 bg-blue-600 hover:bg-blue-700"><Check className="h-4 w-4" /> Guardar</Button>
                <Button size="sm" variant="outline" onClick={() => { setEditing(false); setEtiqueta(c.etiqueta || ""); setColor(c.color || ""); }}><X className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </div>

        {/* Delete confirmation */}
        {confirmDelete && (
          <div className="mt-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/10 p-4">
            <p className="text-sm text-red-700 dark:text-red-300 font-medium">¿Dónde quieres eliminar este cliente?</p>
            <div className="mt-3 space-y-2">
              {([
                ["app", "Solo en esta aplicación", "Se conserva en Contasimple. Los presupuestos y licitaciones quedan sin cliente asignado."],
                ["contasimple", "Solo en Contasimple", "Se borra en Contasimple (Península y Canarias). El cliente se mantiene en la aplicación."],
                ["both", "En ambos sitios", "Se borra en Contasimple y también en esta aplicación."],
              ] as const).map(([val, label, desc]) => {
                const disabled = (val === "contasimple" || val === "both") && !hasContasimple;
                return (
                  <label key={val} className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer ${deleteScope === val ? "border-red-400 bg-white dark:bg-red-950/30" : "border-transparent"} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}>
                    <input type="radio" name="delScope" value={val} checked={deleteScope === val} disabled={disabled}
                      onChange={() => setDeleteScope(val)} className="mt-1 accent-red-600" />
                    <span>
                      <span className="block text-sm font-medium text-red-700 dark:text-red-300">{label}</span>
                      <span className="block text-xs text-red-600/80 dark:text-red-300/70">{desc}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {!hasContasimple && <p className="text-[11px] text-red-600/70 mt-2">Este cliente no está vinculado a Contasimple, solo puedes eliminarlo en la aplicación.</p>}
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="destructive" onClick={doDelete} disabled={deleting} className="gap-1">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Eliminar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancelar</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4"><div className="flex items-center gap-2 text-gray-500 text-sm"><FileSpreadsheet className="h-4 w-4" /> Presupuestos</div><p className="text-2xl font-bold mt-1">{data.totals.budgets}</p></Card>
        <Card className="p-4"><div className="flex items-center gap-2 text-gray-500 text-sm"><SearchIcon className="h-4 w-4" /> Licitaciones</div><p className="text-2xl font-bold mt-1">{data.totals.tenders}</p></Card>
        <Card className="p-4"><div className="flex items-center gap-2 text-gray-500 text-sm"><StickyNote className="h-4 w-4" /> Notas</div><p className="text-2xl font-bold mt-1">{data.totals.notes}</p></Card>
        <Card className="p-4"><div className="flex items-center gap-2 text-gray-500 text-sm"><Clock className="h-4 w-4" /> Notas pend.</div><p className="text-2xl font-bold mt-1">{data.totals.notesPendientes}</p></Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
        {([["resumen", "Resumen"], ["presupuestos", `Presupuestos (${data.totals.budgets})`], ["licitaciones", `Licitaciones (${data.totals.tenders})`], ["notas", `Notas (${data.totals.notes})`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition ${tab === k ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "resumen" && (
        <Card className="p-5">
          <h3 className="text-lg font-semibold mb-4">🕒 Actividad reciente</h3>
          {timeline.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">Sin actividad todavía.</p>
          ) : (
            <ol className="relative border-l border-gray-200 dark:border-gray-700 ml-3 space-y-4">
              {timeline.map((it, i) => (
                <li key={i} className="ml-4">
                  <div className="absolute -left-1.5 w-3 h-3 rounded-full" style={{ background: it.type === "budget" ? "#16a34a" : it.type === "tender" ? "#2563eb" : "#9333ea" }} />
                  <p className="text-xs text-gray-400">{fmtDate(it.date)}</p>
                  {it.type === "note" ? (
                    <p className="text-sm"><StickyNote className="h-3.5 w-3.5 inline mr-1 text-purple-500" />{it.label}</p>
                  ) : (
                    <Link href={it.type === "budget" ? `/budgets/${it.id}` : `/tenders/${it.id}`} className="text-sm text-blue-600 hover:underline">
                      {it.type === "budget" ? <FileSpreadsheet className="h-3.5 w-3.5 inline mr-1" /> : <SearchIcon className="h-3.5 w-3.5 inline mr-1" />}{it.label}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      {tab === "presupuestos" && (
        <div className="space-y-2">
          {data.budgets.length === 0 ? <p className="text-sm text-gray-500 py-6 text-center">Sin presupuestos vinculados.</p> :
            data.budgets.map((b) => (
              <Link key={b.id} href={`/budgets/${b.id}`}>
                <Card className="p-4 hover:shadow-md transition flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{b.nombre || b.cliente || "(sin nombre)"}</p>
                    <p className="text-xs text-gray-500">{fmtDate(b.createdAt)} • {b.estado}</p>
                  </div>
                  <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                </Card>
              </Link>
            ))}
        </div>
      )}

      {tab === "licitaciones" && (
        <div className="space-y-2">
          {data.tenders.length === 0 ? <p className="text-sm text-gray-500 py-6 text-center">Sin licitaciones vinculadas.</p> :
            data.tenders.map((t) => (
              <Link key={t.id} href={`/tenders/${t.id}`}>
                <Card className="p-4 hover:shadow-md transition">
                  <p className="font-medium">{t.title}</p>
                  <p className="text-xs text-gray-500 mt-1">{t.contractingBody} • {fmtDate(t.deadline)}</p>
                </Card>
              </Link>
            ))}
        </div>
      )}

      {tab === "notas" && (
        <Card className="p-5"><EntityNotes customerId={customerId} /></Card>
      )}
    </div>
  );
}
