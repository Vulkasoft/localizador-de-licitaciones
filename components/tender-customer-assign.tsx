'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Contact, Search, Plus, Loader2, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { validateSpanishNif } from '@/lib/nif';

interface Customer { id: string; nombre: string; nif?: string | null; }

export function TenderCustomerAssign({
  tenderId,
  initialCustomer,
  onAssigned,
}: {
  tenderId: string;
  initialCustomer: Customer | null;
  onAssigned?: (c: Customer | null) => void;
}) {
  const [customer, setCustomer] = useState<Customer | null>(initialCustomer);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Create-customer form (creates in the app AND in both Contasimple sedes)
  const [creating, setCreating] = useState(false);
  const [fNombre, setFNombre] = useState('');
  const [fNif, setFNif] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fTelefono, setFTelefono] = useState('');
  const [fDireccion, setFDireccion] = useState('');
  const [fCiudad, setFCiudad] = useState('');
  const [fProvincia, setFProvincia] = useState('');
  const [fCP, setFCP] = useState('');
  const [nifError, setNifError] = useState<string | null>(null);

  useEffect(() => { setCustomer(initialCustomer); }, [initialCustomer]);

  // Debounced search
  useEffect(() => {
    if (!open || creating) return;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/customers?search=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((d) => setResults(Array.isArray(d) ? d : (d?.customers ?? [])))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query, open, creating]);

  // Close on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) { setOpen(false); setCreating(false); }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const assign = useCallback(async (c: Customer | null) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/tenders/${tenderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: c?.id ?? null }),
      });
      if (!res.ok) throw new Error();
      setCustomer(c);
      setOpen(false);
      setQuery('');
      onAssigned?.(c);
      toast.success(c ? `Cliente asignado: ${c.nombre}` : 'Cliente desvinculado');
    } catch { toast.error('Error al asignar cliente'); }
    finally { setBusy(false); }
  }, [tenderId, onAssigned]);

  const openCreateForm = useCallback(() => {
    setFNombre(query.trim());
    setFNif(''); setFEmail(''); setFTelefono(''); setFDireccion(''); setFCiudad(''); setFProvincia(''); setFCP('');
    setNifError(null);
    setCreating(true);
  }, [query]);

  const submitCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const nombre = fNombre.trim();
    if (!nombre) { toast.error('Introduce el nombre del cliente'); return; }
    const check = validateSpanishNif(fNif);
    if (!check.valid) {
      setNifError(check.message || 'El NIF/CIF no es válido.');
      toast.error(check.message || 'El NIF/CIF no es válido para Contasimple.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          nif: fNif.trim(),
          email: fEmail.trim() || null,
          telefono: fTelefono.trim() || null,
          direccion: fDireccion.trim() || null,
          ciudad: fCiudad.trim() || null,
          provincia: fProvincia.trim() || null,
          codigoPostal: fCP.trim() || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d?.field === 'nif') setNifError(d?.error || 'NIF/CIF no válido para Contasimple.');
        toast.error(d?.error || 'Error al crear el cliente');
        setBusy(false);
        return;
      }
      const created = d?.customer as Customer;
      if (d?.contasimpleErrors?.length) {
        toast.warning(`Cliente creado en la aplicación, pero no en Contasimple (${d.contasimpleErrors.join(', ')}). Revisa que el NIF sea válido.`);
      } else {
        toast.success('Cliente creado en la aplicación y en Contasimple (Península y Canarias)');
      }
      setCreating(false);
      await assign(created);
    } catch (err: any) {
      toast.error('Error al crear el cliente');
      setBusy(false);
    }
  }, [fNombre, fNif, fEmail, fTelefono, fDireccion, fCiudad, fProvincia, fCP, assign]);

  const exactExists = results.some((c) => c.nombre.trim().toLowerCase() === query.trim().toLowerCase());

  return (
    <div className="bg-card rounded-xl p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <h3 className="font-display font-semibold mb-3 flex items-center gap-2"><Contact className="w-4 h-4 text-sky-500" /> Cliente</h3>

      {customer ? (
        <div className="flex items-center justify-between gap-2 mb-3">
          <Link href={`/clientes/${customer.id}`} className="text-sm font-medium text-sky-600 hover:underline break-words">{customer.nombre}</Link>
          <button onClick={() => assign(null)} disabled={busy} className="text-xs text-red-500 hover:underline flex-shrink-0 inline-flex items-center gap-1"><X className="w-3 h-3" /> Quitar</button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground mb-3">Sin cliente asignado</p>
      )}

      <div ref={boxRef} className="relative">
        {creating ? (
          <form onSubmit={submitCreate} className="rounded-lg border bg-background p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Nuevo cliente en Contasimple</p>
              <button type="button" onClick={() => setCreating(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <input value={fNombre} onChange={(e) => setFNombre(e.target.value)} placeholder="Nombre / Organización *" autoFocus
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40" />
            <input value={fNif} onChange={(e) => { setFNif(e.target.value); setNifError(null); }} placeholder="NIF / CIF * (obligatorio)"
              className={`w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 ${nifError ? 'border-red-500 focus:ring-red-500/40' : 'focus:ring-sky-500/40'}`} />
            {nifError && <p className="text-[11px] text-red-600">{nifError}</p>}
            <div className="grid grid-cols-2 gap-2">
              <input value={fEmail} onChange={(e) => setFEmail(e.target.value)} placeholder="Email"
                className="px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40" />
              <input value={fTelefono} onChange={(e) => setFTelefono(e.target.value)} placeholder="Teléfono"
                className="px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40" />
              <input value={fDireccion} onChange={(e) => setFDireccion(e.target.value)} placeholder="Dirección"
                className="px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40" />
              <input value={fCiudad} onChange={(e) => setFCiudad(e.target.value)} placeholder="Ciudad"
                className="px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40" />
              <input value={fProvincia} onChange={(e) => setFProvincia(e.target.value)} placeholder="Provincia"
                className="px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40" />
              <input value={fCP} onChange={(e) => setFCP(e.target.value)} placeholder="Código postal"
                className="px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40" />
            </div>
            <p className="text-[11px] text-muted-foreground">Se creará también en Contasimple en las dos sedes (Península y Canarias) y se asignará a esta licitación.</p>
            <div className="flex gap-2">
              <button type="submit" disabled={busy || !fNombre.trim() || !fNif.trim()}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Crear y asignar
              </button>
              <button type="button" onClick={() => setCreating(false)} className="px-3 py-2 rounded-lg border text-sm">Cancelar</button>
            </div>
          </form>
        ) : (
          <>
            <div className="relative">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                placeholder={customer ? 'Cambiar cliente…' : 'Buscar o crear cliente…'}
                disabled={busy}
                className="w-full pl-9 pr-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />
              {busy && <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />}
            </div>

            {open && (
              <div className="absolute z-20 mt-1 w-full rounded-lg border bg-popover shadow-lg max-h-72 overflow-auto">
                {loading ? (
                  <div className="px-3 py-3 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Buscando…</div>
                ) : (
                  <>
                    {results.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => assign(c)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-start justify-between gap-2"
                      >
                        <span className="break-words">{c.nombre}{c.nif ? <span className="text-muted-foreground"> · {c.nif}</span> : null}</span>
                        {customer?.id === c.id && <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                      </button>
                    ))}
                    {results.length === 0 && query.trim() === '' && (
                      <div className="px-3 py-3 text-xs text-muted-foreground">Escribe para buscar clientes…</div>
                    )}
                    {query.trim() !== '' && !exactExists && (
                      <button
                        onClick={openCreateForm}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-500/10 text-emerald-600 border-t flex items-center gap-2 font-medium"
                      >
                        <Plus className="w-4 h-4" /> Crear cliente «{query.trim()}» en Contasimple
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
