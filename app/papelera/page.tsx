'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Trash2, RotateCcw, Search, Info, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { getScoreColor } from '@/lib/spain-geo';
import { CLASSIFICATION_LABELS } from '@/lib/scoring';

interface TrashTender {
  id: string;
  title: string;
  contractingBody: string | null;
  regionCcaa: string | null;
  budgetAmount: number | null;
  score: number | null;
  deadline: string | null;
  dismissedAt: string | null;
  classification: string | null;
  sourceUrl: string | null;
}

export default function PapeleraPage() {
  const [tenders, setTenders] = useState<TrashTender[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [restoring, setRestoring] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/papelera${q ? `?search=${encodeURIComponent(q)}` : ''}`);
      const data = await res.json();
      setTenders(data?.tenders ?? []);
    } catch {
      setTenders([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  const restore = async (id: string) => {
    setRestoring(id);
    try {
      const res = await fetch(`/api/tenders/dismiss?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setTenders((prev) => prev.filter((t) => t.id !== id));
        toast.success('Licitación restaurada — vuelve a estar en tu listado');
      } else {
        toast.error('No se pudo restaurar');
      }
    } catch {
      toast.error('No se pudo restaurar');
    }
    setRestoring(null);
  };

  const fmtDate = (d: string | null) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div>
        <div className="flex items-center gap-2">
          <Trash2 className="w-6 h-6 text-slate-500" />
          <h1 className="text-2xl font-display font-bold tracking-tight">Papelera</h1>
          <span className="text-xs bg-slate-500/10 text-slate-600 px-2 py-0.5 rounded-full font-medium">{tenders.length}</span>
        </div>
        <p className="text-muted-foreground text-sm mt-1">
          Todo lo que has descartado. Guardado por si se te escapa alguna — puedes restaurarla cuando quieras.
        </p>
      </div>

      {/* Informational note */}
      <div className="bg-sky-500/5 border border-sky-500/20 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-sky-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          Las licitaciones de la papelera no cuentan en el panel, no aparecen en el mapa ni se usan para indexar documentos.
          Solo se guardan aquí como respaldo. Pulsa <span className="font-medium text-foreground">Restaurar</span> para devolver una al listado.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar en la papelera..."
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />)}
        </div>
      ) : tenders.length === 0 ? (
        <div className="bg-card rounded-xl p-10 text-center" style={{ boxShadow: 'var(--shadow-md)' }}>
          <Trash2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{search ? 'Sin resultados en la papelera' : 'La papelera está vacía'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tenders.map((t) => (
            <div key={t.id} className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border/50" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center font-mono font-bold text-sm text-white flex-shrink-0" style={{ backgroundColor: getScoreColor(t.score ?? 0) }}>{t.score ?? 0}</div>
              <div className="flex-1 min-w-0">
                <Link href={`/tenders/${t.id}`} className="text-sm font-medium truncate block hover:text-sky-600 transition">{t.title ?? 'Sin título'}</Link>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                  <span className="truncate">{t.contractingBody ?? ''}</span>
                  {t.regionCcaa && <span className="flex-shrink-0">· {t.regionCcaa}</span>}
                  {t.classification && <span className="flex-shrink-0 bg-slate-500/10 text-slate-600 px-1.5 py-0.5 rounded">{CLASSIFICATION_LABELS[t.classification] ?? t.classification}</span>}
                  {t.dismissedAt && <span className="flex-shrink-0">· Descartada {fmtDate(t.dismissedAt)}</span>}
                </div>
              </div>
              <button
                onClick={() => restore(t.id)}
                disabled={restoring === t.id}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 disabled:opacity-70 text-white text-xs font-medium transition flex-shrink-0"
              >
                {restoring === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                <span className="hidden sm:inline">Restaurar</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
