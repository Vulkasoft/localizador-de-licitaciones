'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal, ArrowUpDown, FileText, Heart, ExternalLink, Download, Clock, CheckCircle, FileWarning, Trash2, CheckSquare, Square, XSquare } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CLASSIFICATION_LABELS } from '@/lib/scoring';
import { getScoreColor, CCAA_DATA } from '@/lib/spain-geo';

const CCAA_LIST = Object.keys(CCAA_DATA).sort();
const CATEGORIES = Object.entries(CLASSIFICATION_LABELS);

const BUDGET_RANGES = [
  { label: 'Todos', min: 0, max: 999999999 },
  { label: '<50K €', min: 0, max: 50000 },
  { label: '50K-200K €', min: 50000, max: 200000 },
  { label: '200K-1M €', min: 200000, max: 1000000 },
  { label: '>1M €', min: 1000000, max: 999999999 },
];

export default function TendersPage() {
  const sp = useSearchParams();
  const expiring = sp?.get('expiring') === 'true';
  const newOnly = sp?.get('new') === 'true';
  const showAll = sp?.get('pliegos') === 'false';
  const [tenders, setTenders] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ccaa, setCcaa] = useState(sp?.get('ccaa') ?? '');
  const [category, setCategory] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [sortBy, setSortBy] = useState('score');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [budgetRange, setBudgetRange] = useState(0);
  const [customerId, setCustomerId] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [includeSinPliegos, setIncludeSinPliegos] = useState(showAll);
  const [exporting, setExporting] = useState(false);

  // Selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dismissingBatch, setDismissingBatch] = useState(false);

  const fetchTenders = useCallback(async () => {
    setLoading(true);
    setSelected(new Set()); // Clear selection on new fetch
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (ccaa) params.set('ccaa', ccaa);
      if (category) params.set('category', category);
      if (minScore > 0) params.set('minScore', String(minScore));
      if (expiring) params.set('expiring', 'true');
      if (newOnly) params.set('new', 'true');
      if (includeSinPliegos) params.set('pliegos', 'false');
      if (customerId) params.set('customerId', customerId);
      if (budgetRange > 0) {
        const range = BUDGET_RANGES[budgetRange];
        params.set('minBudget', String(range.min));
        params.set('maxBudget', String(range.max));
      }
      params.set('sourceFilter', 'official');
      params.set('phaseFilter', 'active');
      params.set('objectFilter', 'relevant');
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);
      params.set('limit', '100');
      const res = await fetch(`/api/tenders?${params.toString()}`);
      const data = await res?.json?.();
      setTenders(data?.tenders ?? []);
      setTotal(data?.total ?? 0);
    } catch {} finally { setLoading(false); }
  }, [search, ccaa, category, minScore, sortBy, sortOrder, expiring, newOnly, includeSinPliegos, budgetRange, customerId]);

  useEffect(() => { fetchTenders(); }, [fetchTenders]);

  useEffect(() => {
    fetch('/api/customers').then((r: any) => r?.json?.()).then((d: any) => {
      setCustomers(Array.isArray(d) ? d : (d?.customers ?? []));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/favorites').then((r: any) => r?.json?.()).then((d: any) => {
      const ids = new Set((d?.favorites ?? []).map((f: any) => f?.tenderId));
      setFavorites(ids as Set<string>);
    }).catch(() => {});
  }, []);

  const toggleFav = async (tenderId: string) => {
    await fetch('/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenderId }) });
    setFavorites((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(tenderId)) next.delete(tenderId); else next.add(tenderId);
      return next;
    });
  };

  const exportCSV = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (ccaa) params.set('ccaa', ccaa);
      if (category) params.set('category', category);
      if (minScore > 0) params.set('minScore', String(minScore));
      if (includeSinPliegos) params.set('pliegos', 'false');
      params.set('sourceFilter', 'official');
      params.set('phaseFilter', 'active');
      params.set('objectFilter', 'relevant');
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);
      const res = await fetch(`/api/export-csv?${params.toString()}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `licitaciones_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('CSV exportado correctamente');
    } catch { toast.error('Error al exportar CSV'); }
    finally { setExporting(false); }
  };

  // --- Selection helpers ---
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === tenders.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(tenders.map(t => t.id)));
    }
  };

  const dismissSelected = async () => {
    if (selected.size === 0) return;
    const count = selected.size;
    if (!confirm(`¿Descartar ${count} licitación${count > 1 ? 'es' : ''}? No volverán a aparecer.`)) return;
    setDismissingBatch(true);
    try {
      const res = await fetch('/api/tenders/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenderIds: Array.from(selected) }),
      });
      if (res.ok) {
        const data = await res.json();
        setTenders(prev => prev.filter(t => !selected.has(t.id)));
        setTotal(prev => prev - (data.dismissed ?? count));
        setSelected(new Set());
        toast.success(`${data.dismissed ?? count} licitación${(data.dismissed ?? count) > 1 ? 'es' : ''} descartada${(data.dismissed ?? count) > 1 ? 's' : ''}`);
      } else {
        toast.error('Error al descartar');
      }
    } catch { toast.error('Error al descartar'); }
    setDismissingBatch(false);
  };

  const daysUntil = (d: string | null) => {
    if (!d) return null;
    return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const pliegosStatus = (t: any) => {
    const hasTech = !!t?.technicalDocUrl;
    const hasAdmin = !!t?.adminDocUrl;
    let docCount = 0;
    try { docCount = JSON.parse(t?.documentsJson || '[]').length; } catch {}
    if (hasTech && hasAdmin) return { label: 'Pliegos completos', icon: CheckCircle, color: 'text-emerald-600 bg-emerald-500/10' };
    if (hasTech || hasAdmin || docCount > 0) return { label: `${docCount > 0 ? docCount + ' docs' : 'Pliego parcial'}`, icon: FileText, color: 'text-amber-600 bg-amber-500/10' };
    return { label: 'Sin pliegos', icon: FileWarning, color: 'text-muted-foreground bg-muted' };
  };

  const allSelected = tenders.length > 0 && selected.size === tenders.length;
  const someSelected = selected.size > 0;

  return (
    <div className="space-y-5 max-w-[1200px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">
          {expiring ? 'Vencen Pronto' : newOnly ? 'Nuevas Esta Semana' : 'Licitaciones con Pliegos'}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {expiring
            ? 'Licitaciones abiertas con plazo en los próximos 14 días'
            : newOnly
              ? 'Licitaciones publicadas en los últimos 7 días con documentación'
              : 'Solo licitaciones abiertas de fuentes oficiales con pliegos técnicos o administrativos'}
        </p>
      </div>

      {/* Search & Quick Filters */}
      <div className="bg-card rounded-xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e: any) => setSearch(e?.target?.value ?? '')} placeholder="Buscar licitación..." className="pl-10" />
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className="gap-2">
            <SlidersHorizontal className="w-4 h-4" /> Filtros
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={exporting || total === 0} className="gap-2">
            <Download className="w-4 h-4" /> CSV
          </Button>
          <select value={sortBy} onChange={(e: any) => setSortBy(e?.target?.value ?? 'score')} className="px-3 py-2 rounded-lg border bg-background text-sm">
            <option value="score">Puntuación</option>
            <option value="budgetAmount">Presupuesto</option>
            <option value="deadline">Plazo</option>
            <option value="publicationDate">Fecha</option>
          </select>
          <button onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')} className="p-2 rounded-lg border hover:bg-muted transition">
            <ArrowUpDown className="w-4 h-4" />
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t">
            <select value={ccaa} onChange={(e: any) => setCcaa(e?.target?.value ?? '')} className="px-3 py-2 rounded-lg border bg-background text-sm">
              <option value="">Todas las CCAA</option>
              {CCAA_LIST.map((c: string) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={category} onChange={(e: any) => setCategory(e?.target?.value ?? '')} className="px-3 py-2 rounded-lg border bg-background text-sm">
              <option value="">Todas las categorías</option>
              {CATEGORIES.map(([k, v]: [string, string]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={budgetRange} onChange={(e: any) => setBudgetRange(parseInt(e?.target?.value ?? '0'))} className="px-3 py-2 rounded-lg border bg-background text-sm">
              {BUDGET_RANGES.map((r, i) => <option key={i} value={i}>{r.label}</option>)}
            </select>
            <select value={customerId} onChange={(e: any) => setCustomerId(e?.target?.value ?? '')} className="px-3 py-2 rounded-lg border bg-background text-sm">
              <option value="">Todos los clientes</option>
              {customers.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <div className="flex items-center gap-2 sm:col-span-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Punt. mín:</span>
              <input type="range" min={0} max={100} value={minScore} onChange={(e: any) => setMinScore(parseInt(e?.target?.value ?? '0'))} className="flex-1" />
              <span className="text-sm font-mono w-8">{minScore}</span>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={includeSinPliegos} onChange={(e: any) => setIncludeSinPliegos(!!e?.target?.checked)} className="w-4 h-4 accent-sky-500" />
              <span className="text-muted-foreground">Incluir también sin pliegos</span>
            </label>
          </div>
        )}
      </div>

      {/* Results count + Select All */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {tenders.length > 0 && !loading && (
            <button
              onClick={selectAll}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
              title={allSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
            >
              {allSelected ? <XSquare className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
              {allSelected ? 'Deseleccionar' : 'Seleccionar todo'}
            </button>
          )}
          <span className="text-sm text-muted-foreground">{total} licitación{total !== 1 ? 'es' : ''}{!includeSinPliegos ? ' con pliegos' : ''}</span>
        </div>
        {!includeSinPliegos && (
          <button onClick={() => { setIncludeSinPliegos(true); }} className="text-xs text-sky-600 hover:underline">
            Ver también sin pliegos
          </button>
        )}
      </div>

      {/* Batch Action Bar */}
      {someSelected && (
        <div className="sticky top-14 z-20 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-xl p-3 flex items-center justify-between gap-3 animate-in slide-in-from-top-2" style={{ boxShadow: 'var(--shadow-md)' }}>
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-red-500" />
            <span className="text-sm font-medium text-red-700 dark:text-red-300">
              {selected.size} seleccionada{selected.size > 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted transition"
            >
              Cancelar
            </button>
            <button
              onClick={dismissSelected}
              disabled={dismissingBatch}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {dismissingBatch ? 'Descartando...' : `Descartar (${selected.size})`}
            </button>
          </div>
        </div>
      )}

      {/* Tender Cards */}
      <div className="space-y-3">
        {loading ? [1,2,3,4,5].map((i: number) => <div key={i} className="h-28 bg-muted/50 rounded-xl animate-pulse" />) :
          tenders.length === 0 ? (
            <div className="text-center py-16 bg-card rounded-xl" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">No se encontraron licitaciones</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Prueba ampliando los filtros o incluyendo licitaciones sin pliegos</p>
            </div>
          ) :
          tenders.map((t: any) => {
            const days = daysUntil(t?.deadline);
            const pliegos = pliegosStatus(t);
            const PliegosIcon = pliegos.icon;
            const isSelected = selected.has(t?.id);
            return (
              <div
                key={t?.id}
                className={`bg-card rounded-xl p-4 transition-all group cursor-pointer ${
                  isSelected
                    ? 'ring-2 ring-red-400 dark:ring-red-500 shadow-md'
                    : 'hover:shadow-lg'
                }`}
                style={{ boxShadow: isSelected ? undefined : 'var(--shadow-sm)' }}
                onClick={() => toggleSelect(t?.id)}
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  {/* Checkbox */}
                  <div className="flex-shrink-0 pt-0.5">
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition ${
                      isSelected
                        ? 'bg-red-500 border-red-500 text-white'
                        : 'border-muted-foreground/30 group-hover:border-muted-foreground/60'
                    }`}>
                      {isSelected && (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* Score */}
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center font-mono font-bold text-white text-sm flex-shrink-0" style={{ backgroundColor: getScoreColor(t?.score ?? 0) }}>
                    {t?.score ?? 0}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/tenders/${t?.id}`}
                      className="text-sm font-semibold hover:text-sky-600 transition line-clamp-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t?.title ?? 'Sin título'}
                    </Link>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                      <span className="truncate max-w-[200px]">{t?.contractingBody ?? ''}</span>
                      {t?.regionCcaa && <span>{t.regionCcaa}</span>}
                      {t?.budgetAmount > 0 && <span className="font-mono">{(t.budgetAmount).toLocaleString('es-ES', { maximumFractionDigits: 0 })} €</span>}
                    </div>

                    {/* Badges row */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {t?.objectType === 'compra' && <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold">🛒 Compra</span>}
                      {t?.objectType === 'formacion' && <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-700 dark:text-violet-300 text-[10px] font-semibold">🎓 Formación</span>}

                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium inline-flex items-center gap-1 ${pliegos.color}`}>
                        <PliegosIcon className="w-3 h-3" /> {pliegos.label}
                      </span>

                      {days !== null && days >= 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium inline-flex items-center gap-1 ${
                          days <= 3 ? 'bg-red-500/10 text-red-600' : days <= 7 ? 'bg-orange-500/10 text-orange-600' : 'bg-muted text-muted-foreground'
                        }`}>
                          <Clock className="w-3 h-3" /> {days === 0 ? 'HOY' : `${days}d`}
                        </span>
                      )}

                      {days !== null && days < 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold inline-flex items-center gap-1 bg-red-500/15 text-red-700 dark:text-red-300">
                          <Clock className="w-3 h-3" /> Vencida
                        </span>
                      )}

                      {t?.classification && <span className="px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300 text-[10px] font-medium">{CLASSIFICATION_LABELS[t.classification] ?? t.classification}</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => toggleFav(t?.id)} className={`p-2 rounded-lg transition ${favorites.has(t?.id) ? 'text-red-500 bg-red-500/10' : 'text-muted-foreground hover:text-red-500 hover:bg-red-500/10'}`} title="Favorito">
                      <Heart className={`w-4 h-4 ${favorites.has(t?.id) ? 'fill-current' : ''}`} />
                    </button>
                    {t?.sourceUrl && <a href={t.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="p-2 rounded-lg text-muted-foreground hover:text-sky-500 hover:bg-sky-500/10 transition" title="Ver en fuente"><ExternalLink className="w-4 h-4" /></a>}
                  </div>
                </div>
              </div>
            );
          })
        }
      </div>
    </div>
  );
}
