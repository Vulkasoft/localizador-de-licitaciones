'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FileText, Download, Search, Filter, FolderOpen, ExternalLink, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { getScoreColor } from '@/lib/spain-geo';
import { CCAA_DATA } from '@/lib/spain-geo';

interface IndexedTender {
  id: string;
  title: string;
  contractingBody: string;
  ccaa: string;
  budgetAmount: number | null;
  publicationDate: string;
  deadline: string | null;
  sourceUrl: string | null;
  score: number;
  documentCount: number;
  categoryBreakdown: Record<string, number>;
  hasTechnicalDoc: boolean;
  hasAdminDoc: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  pliego_tecnico: 'Técnico',
  pliego_administrativo: 'Administrativo',
  pliego_admin: 'Administrativo',
  adjudicacion: 'Adjudicación',
  formalizacion: 'Formalización',
  acta: 'Acta',
  resolucion: 'Resolución',
  anuncio: 'Anuncio',
  memoria: 'Memoria',
  informe: 'Informe',
  especificaciones: 'Especificaciones',
  otro: 'Otro',
  otros: 'Otros',
};

// Red tones for closed/adjudicated categories to make them visually obvious
const CATEGORY_COLORS: Record<string, string> = {
  pliego_tecnico: 'bg-blue-500/10 text-blue-700 border-blue-400/50',
  pliego_administrativo: 'bg-purple-500/10 text-purple-700 border-purple-400/50',
  pliego_admin: 'bg-purple-500/10 text-purple-700 border-purple-400/50',
  adjudicacion: 'bg-red-500/15 text-red-700 border-red-400/60',
  formalizacion: 'bg-red-500/15 text-red-700 border-red-400/60',
  acta: 'bg-red-500/15 text-red-700 border-red-400/60',
  resolucion: 'bg-red-500/15 text-red-700 border-red-400/60',
  anuncio: 'bg-amber-500/10 text-amber-700 border-amber-400/50',
  memoria: 'bg-sky-500/10 text-sky-700 border-sky-400/50',
  informe: 'bg-orange-500/10 text-orange-700 border-orange-400/50',
  especificaciones: 'bg-teal-500/10 text-teal-700 border-teal-400/50',
  otro: 'bg-gray-500/10 text-gray-700 border-gray-400/50',
  otros: 'bg-gray-500/10 text-gray-700 border-gray-400/50',
};

const DRONE_CPVS = [
  { code: '35125300', label: 'Drones / Aeronaves no tripuladas' },
  { code: '38652120', label: 'Sistemas de vigilancia aérea' },
  { code: '48900000', label: 'Software de control de vuelo' },
  { code: '35125400', label: 'Equipamiento aéreo profesional' },
  { code: '38652000', label: 'Sistemas de vigilancia' },
];

const DOC_CATEGORIES = [
  { key: 'pliego_tecnico', label: 'Pliego Técnico', color: 'bg-blue-500/10 text-blue-700 border-blue-400/50' },
  { key: 'pliego_admin', label: 'Pliego Administrativo', color: 'bg-purple-500/10 text-purple-700 border-purple-400/50' },
  { key: 'memoria', label: 'Memoria', color: 'bg-sky-500/10 text-sky-700 border-sky-400/50' },
  { key: 'informe', label: 'Informe', color: 'bg-orange-500/10 text-orange-700 border-orange-400/50' },
  { key: 'especificaciones', label: 'Especificaciones', color: 'bg-teal-500/10 text-teal-700 border-teal-400/50' },
  { key: 'otro', label: 'Otro', color: 'bg-gray-500/10 text-gray-700 border-gray-400/50' },
];

const CLOSED_CATEGORIES = ['adjudicacion', 'adjudicación', 'formalizacion', 'formalización', 'acta', 'resolucion', 'resolución'];

const BUDGET_RANGES = [
  { label: 'Menos de 50K €', min: 0, max: 50000 },
  { label: '50K - 200K €', min: 50000, max: 200000 },
  { label: '200K - 1M €', min: 200000, max: 1000000 },
  { label: 'Más de 1M €', min: 1000000, max: null },
];

export default function DocumentosPage() {
  const [tenders, setTenders] = useState<IndexedTender[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ccaaFilter, setCcaaFilter] = useState('');
  const [cpvFilter, setCpvFilter] = useState('');
  const [budgetRange, setBudgetRange] = useState('');
  const [minScore, setMinScore] = useState('');
  const [excludeClosed, setExcludeClosed] = useState(true); // Exclude adjudicadas by default
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]); // Include only these
  const [sortBy, setSortBy] = useState('createdAt');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchTenders();
  }, [search, ccaaFilter, cpvFilter, budgetRange, minScore, excludeClosed, selectedCategories, sortBy, page]);

  const fetchTenders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (ccaaFilter) params.set('ccaa', ccaaFilter);
      if (cpvFilter) params.set('cpv', cpvFilter);
      if (minScore) params.set('minScore', minScore);
      if (sortBy) params.set('sortBy', sortBy);
      params.set('sortOrder', 'desc');
      
      // Budget range
      if (budgetRange) {
        const range = BUDGET_RANGES.find(r => `${r.min}-${r.max}` === budgetRange);
        if (range) {
          if (range.min) params.set('minBudget', range.min.toString());
          if (range.max) params.set('maxBudget', range.max.toString());
        }
      }
      
      // Category filters
      if (excludeClosed) {
        params.set('excludeCategories', CLOSED_CATEGORIES.join(','));
      }
      if (selectedCategories.length > 0) {
        params.set('includeCategories', selectedCategories.join(','));
      }
      
      params.set('page', page.toString());
      params.set('limit', '20');

      const res = await fetch(`/api/indexed-docs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTenders(data.tenders || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotal(data.pagination?.total || 0);
      }
    } catch (e) {
      console.error('Error loading indexed docs:', e);
    }
    setLoading(false);
  };

  const allCcaas = Array.from(
    new Set(
      Object.keys(CCAA_DATA)
        .filter(c => c !== 'Ámbito Nacional')
        .sort()
    )
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Documentos Indexados</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {total} licitaciones con documentos procesados
        </p>
      </div>

      {/* Search & Filters */}
      <div className="bg-card rounded-xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por título u organismo..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>

          {/* Sort dropdown */}
          <select
            value={sortBy}
            onChange={e => { setSortBy(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg border-2 border-border bg-background text-sm font-medium min-w-[180px]"
          >
            <option value="createdAt">Más recientes</option>
            <option value="publicationDate">Fecha publicación</option>
            <option value="deadline">Próximos a vencer</option>
            <option value="score">Mayor puntuación</option>
            <option value="budgetAmount">Mayor presupuesto</option>
          </select>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-border hover:bg-muted/50 transition text-sm font-medium"
          >
            <Filter className="w-4 h-4" />
            Filtros
            {(ccaaFilter || cpvFilter || budgetRange || minScore || excludeClosed || selectedCategories.length > 0) && (
              <span className="bg-sky-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {[ccaaFilter, cpvFilter, budgetRange, minScore, excludeClosed ? 1 : 0, selectedCategories.length].filter(v => !!v).length}
              </span>
            )}
          </button>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* CCAA Filter */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Comunidad Autónoma</label>
                <select
                  value={ccaaFilter}
                  onChange={e => { setCcaaFilter(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 rounded-lg border-2 border-border bg-background text-sm"
                >
                  <option value="">Todas las CCAA</option>
                  {allCcaas.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* CPV Filter */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Código CPV</label>
                <select
                  value={cpvFilter}
                  onChange={e => { setCpvFilter(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 rounded-lg border-2 border-border bg-background text-sm"
                >
                  <option value="">Todos los CPV</option>
                  {DRONE_CPVS.map(cpv => (
                    <option key={cpv.code} value={cpv.code}>{cpv.label}</option>
                  ))}
                </select>
              </div>

              {/* Budget Range Filter */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Rango de Presupuesto</label>
                <select
                  value={budgetRange}
                  onChange={e => { setBudgetRange(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 rounded-lg border-2 border-border bg-background text-sm"
                >
                  <option value="">Todos los presupuestos</option>
                  {BUDGET_RANGES.map((range, idx) => (
                    <option key={idx} value={`${range.min}-${range.max}`}>{range.label}</option>
                  ))}
                </select>
              </div>

              {/* Min Score Filter */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Puntuación mínima</label>
                <select
                  value={minScore}
                  onChange={e => { setMinScore(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 rounded-lg border-2 border-border bg-background text-sm"
                >
                  <option value="">Todas las puntuaciones</option>
                  <option value="70">70+ (Alta)</option>
                  <option value="50">50+ (Media-Alta)</option>
                  <option value="30">30+ (Media)</option>
                </select>
              </div>
            </div>

            {/* Document Category Filters - CRITICAL SECTION */}
            <div className="mt-4 pt-4 border-t-2 border-red-500/20">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <h3 className="text-sm font-bold text-red-700">Filtro de Documentos (Importante)</h3>
              </div>
              
              {/* Exclude Closed Tenders Toggle */}
              <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border-2 border-red-200 dark:border-red-900">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={excludeClosed}
                    onChange={e => { setExcludeClosed(e.target.checked); setPage(1); }}
                    className="mt-0.5 w-5 h-5 rounded border-2 border-red-400 text-red-600 focus:ring-red-500 cursor-pointer"
                  />
                  <div className="flex-1">
                    <span className="font-semibold text-sm text-red-700">Excluir licitaciones ya adjudicadas</span>
                    <p className="text-xs text-red-600 mt-1">
                      Oculta licitaciones con documentos de adjudicación, formalización o actas. <strong>Estas ya están cerradas y no puedes ganarlas.</strong>
                    </p>
                    {excludeClosed && (
                      <p className="text-xs text-green-700 mt-1 font-medium">
                        ✓ Activado - Solo verás licitaciones activas
                      </p>
                    )}
                  </div>
                </label>
              </div>

              {/* Include Specific Categories */}
              <div>
                <label className="text-sm font-medium mb-2 block">Mostrar solo estos tipos de documentos (opcional)</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {DOC_CATEGORIES.map(cat => (
                    <label key={cat.key} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-muted/50 transition">
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(cat.key)}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedCategories([...selectedCategories, cat.key]);
                          } else {
                            setSelectedCategories(selectedCategories.filter(c => c !== cat.key));
                          }
                          setPage(1);
                        }}
                        className="w-4 h-4 rounded border-2 border-border"
                      />
                      <span className={`text-xs px-2 py-0.5 rounded border ${cat.color}`}>{cat.label}</span>
                    </label>
                  ))}
                </div>
                {selectedCategories.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Mostrando solo licitaciones con: <strong>{selectedCategories.join(', ')}</strong>
                  </p>
                )}
              </div>
            </div>

            {/* Clear filters button */}
            {(ccaaFilter || cpvFilter || budgetRange || minScore || !excludeClosed || selectedCategories.length > 0) && (
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => {
                    setCcaaFilter('');
                    setCpvFilter('');
                    setBudgetRange('');
                    setMinScore('');
                    setExcludeClosed(true); // Reset to default (exclude closed)
                    setSelectedCategories([]);
                    setPage(1);
                  }}
                  className="text-xs text-sky-600 hover:text-sky-700 font-medium transition"
                >
                  Limpiar todos los filtros
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando...</div>
      ) : tenders.length === 0 ? (
        <div className="text-center py-12">
          <FolderOpen className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">No se encontraron licitaciones con documentos indexados</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tenders.map(t => (
            <div key={t.id} className="bg-card rounded-xl p-5 hover:shadow-lg transition" style={{ boxShadow: 'var(--shadow-sm)' }}>
              {/* Header row */}
              <div className="flex items-start gap-4 mb-3">
                {/* Score badge */}
                <div className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: getScoreColor(t.score) }}>
                  {t.score}
                </div>

                {/* Title & Body */}
                <div className="flex-1 min-w-0">
                  <Link href={`/tenders/${t.id}`} className="font-semibold text-base hover:text-sky-600 transition line-clamp-2 block">
                    {t.title}
                  </Link>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{t.contractingBody}</p>
                </div>

                {/* Budget */}
                {t.budgetAmount && (
                  <div className="flex-shrink-0 text-right">
                    <div className="text-base font-bold text-emerald-600">
                      {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(t.budgetAmount)}
                    </div>
                  </div>
                )}
              </div>

              {/* Meta info */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground mb-3">
                <span className="flex items-center gap-1">
                  <span className="font-medium">{t.ccaa}</span>
                </span>
                <span>
                  Publicación: {new Date(t.publicationDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                </span>
                {t.deadline && (
                  <span>
                    Plazo: {new Date(t.deadline).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>

              {/* Document stats */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Total count badge */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 text-sky-700 border-2 border-sky-400/50 font-semibold text-sm">
                  <FileText className="w-4 h-4" />
                  {t.documentCount} {t.documentCount === 1 ? 'documento' : 'documentos'}
                </div>

                {/* Primary docs badges */}
                {t.hasTechnicalDoc && (
                  <div className="px-2 py-1 rounded text-xs font-medium border-2 bg-blue-500/10 text-blue-700 border-blue-400/50">
                    Técnico
                  </div>
                )}
                {t.hasAdminDoc && (
                  <div className="px-2 py-1 rounded text-xs font-medium border-2 bg-purple-500/10 text-purple-700 border-purple-400/50">
                    Administrativo
                  </div>
                )}

                {/* Category breakdown */}
                {Object.entries(t.categoryBreakdown)
                  .filter(([cat]) => cat !== 'pliego_tecnico' && cat !== 'pliego_administrativo')
                  .map(([cat, count]) => (
                    <div key={cat} className={`px-2 py-1 rounded text-xs font-medium border-2 ${CATEGORY_COLORS[cat] || CATEGORY_COLORS.otros}`}>
                      {CATEGORY_LABELS[cat] || cat} ({count})
                    </div>
                  ))}

                {/* Link to tender detail */}
                <Link
                  href={`/tenders/${t.id}`}
                  className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium transition"
                >
                  Ver documentos
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-lg border-2 border-border hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="text-sm font-medium px-3">
            Página {page} de {totalPages}
          </span>

          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 rounded-lg border-2 border-border hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
