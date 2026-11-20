'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Calculator, Search, Plus, Loader2, X, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface Budget { id: string; nombre?: string | null; cliente?: string | null; estado?: string; tipo?: string; customer?: { id: string; nombre: string } | null; }

const ESTADO_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente', PENDIENTE_MORA: 'Pendiente (mora)', PENDIENTE_OROZCO: 'Pendiente (Orozco)',
  PENDIENTE_RETENCION_CREDITO: 'Pendiente (retención)', LICITACION_ENVIADA: 'Licitación enviada',
  PRESUPUESTO_ENVIADO: 'Presupuesto enviado', ENTREGADO: 'Entregado', PAGADO: 'Pagado',
};

export function TenderBudgets({
  tenderId,
  tenderTitle,
}: {
  tenderId: string;
  tenderTitle?: string | null;
}) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Budget[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    setLoadingList(true);
    fetch(`/api/budgets?tenderId=${encodeURIComponent(tenderId)}&limit=100`)
      .then((r) => r.json())
      .then((d) => setBudgets(Array.isArray(d?.budgets) ? d.budgets : []))
      .catch(() => setBudgets([]))
      .finally(() => setLoadingList(false));
  }, [tenderId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!open) return;
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/budgets?search=${encodeURIComponent(query)}&limit=20`)
        .then((r) => r.json())
        .then((d) => setResults(Array.isArray(d?.budgets) ? d.budgets : []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query, open]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const setTender = useCallback(async (budgetId: string, value: string | null) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/budgets/${budgetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenderId: value }),
      });
      if (!res.ok) throw new Error();
      setOpen(false); setQuery('');
      refresh();
      toast.success(value ? 'Presupuesto vinculado' : 'Presupuesto desvinculado');
    } catch { toast.error('Error al actualizar el presupuesto'); }
    finally { setBusy(false); }
  }, [refresh]);

  const nuevoHref = `/contasimple/nuevo?tenderId=${encodeURIComponent(tenderId)}${
    tenderTitle ? `&nombre=${encodeURIComponent(tenderTitle.slice(0, 120))}` : ''
  }`;

  const assignedIds = new Set(budgets.map((b) => b.id));

  return (
    <div className="bg-card rounded-xl p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <h3 className="font-display font-semibold mb-3 flex items-center gap-2"><Calculator className="w-4 h-4 text-sky-500" /> Presupuestos</h3>

      {loadingList ? (
        <div className="text-xs text-muted-foreground flex items-center gap-2 mb-3"><Loader2 className="w-3 h-3 animate-spin" /> Cargando…</div>
      ) : budgets.length === 0 ? (
        <p className="text-xs text-muted-foreground mb-3">Sin presupuestos vinculados</p>
      ) : (
        <div className="space-y-2 mb-3">
          {budgets.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/50 border border-border/60">
              <div className="min-w-0">
                <Link href={`/budgets/${b.id}`} className="text-sm font-medium text-sky-600 hover:underline truncate flex items-center gap-1">
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{b.nombre || b.cliente || 'Presupuesto'}</span>
                </Link>
                {b.estado && <span className="text-[10px] text-muted-foreground">{ESTADO_LABELS[b.estado] || b.estado}</span>}
              </div>
              <button onClick={() => setTender(b.id, null)} disabled={busy} className="text-xs text-red-500 hover:underline flex-shrink-0 inline-flex items-center gap-1"><X className="w-3 h-3" /> Quitar</button>
            </div>
          ))}
        </div>
      )}

      <div ref={boxRef} className="relative">
        <div className="relative">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Vincular presupuesto existente…"
            disabled={busy}
            className="w-full pl-9 pr-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40"
          />
          {busy && <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />}
        </div>

        {open && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border bg-popover shadow-lg max-h-72 overflow-auto">
            {searching ? (
              <div className="px-3 py-3 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Buscando…</div>
            ) : (
              <>
                {results.filter((b) => !assignedIds.has(b.id)).map((b) => (
                  <button key={b.id} onClick={() => setTender(b.id, tenderId)} className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex flex-col">
                    <span className="truncate font-medium">{b.nombre || b.cliente || 'Presupuesto'}</span>
                    <span className="text-[10px] text-muted-foreground">{b.customer?.nombre || b.cliente || ''}{b.estado ? ` · ${ESTADO_LABELS[b.estado] || b.estado}` : ''}</span>
                  </button>
                ))}
                {results.filter((b) => !assignedIds.has(b.id)).length === 0 && (
                  <div className="px-3 py-3 text-xs text-muted-foreground">No hay presupuestos que coincidan.</div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <Link
        href={nuevoHref}
        className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white text-sm font-medium transition"
      >
        <Plus className="w-4 h-4" /> Crear presupuesto en Contasimple
      </Link>
      <p className="mt-1.5 text-[10px] text-muted-foreground text-center">Se creará en Contasimple y se vinculará automáticamente a esta licitación.</p>
    </div>
  );
}
