'use client';
import { useState, useEffect } from 'react';
import { BookmarkCheck, Trash2, Bell, BellOff, Search, Edit2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import Link from 'next/link';

interface SavedSearch {
  id: string;
  name: string;
  queryParams: any;
  emailAlerts: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function SavedSearchesPage() {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSearches();
  }, []);

  const loadSearches = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/saved-searches');
      const data = await res.json();
      setSearches(data?.searches ?? []);
    } catch (error) {
      toast.error('Error al cargar búsquedas');
    } finally {
      setLoading(false);
    }
  };

  const toggleAlerts = async (id: string, current: boolean) => {
    try {
      const search = searches.find(s => s.id === id);
      if (!search) return;

      await fetch('/api/saved-searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name: search.name,
          queryParams: search.queryParams,
          emailAlerts: !current
        })
      });

      setSearches(prev => prev.map(s => 
        s.id === id ? { ...s, emailAlerts: !current } : s
      ));

      toast.success(!current ? 'Alertas activadas' : 'Alertas desactivadas');
    } catch (error) {
      toast.error('Error al actualizar alertas');
    }
  };

  const deleteSearch = async (id: string) => {
    if (!confirm('¿Eliminar esta búsqueda guardada?')) return;

    try {
      await fetch(`/api/saved-searches?id=${id}`, { method: 'DELETE' });
      setSearches(prev => prev.filter(s => s.id !== id));
      toast.success('Búsqueda eliminada');
    } catch (error) {
      toast.error('Error al eliminar búsqueda');
    }
  };

  const buildSearchUrl = (params: any): string => {
    const urlParams = new URLSearchParams();
    if (params.search) urlParams.set('search', params.search);
    if (params.ccaa) urlParams.set('ccaa', params.ccaa);
    if (params.category) urlParams.set('category', params.category);
    if (params.minScore > 0) urlParams.set('minScore', String(params.minScore));
    if (params.status) urlParams.set('status', params.status);
    if (params.expiring) urlParams.set('expiring', 'true');
    if (params.newOnly) urlParams.set('new', 'true');
    if (params.pliegosOnly) urlParams.set('pliegos', 'true');
    if (params.showExpired) urlParams.set('showExpired', 'true');
    if (params.contractType && params.contractType !== 'all') urlParams.set('contractType', params.contractType);
    return `/tenders?${urlParams.toString()}`;
  };

  const getSearchSummary = (params: any): string[] => {
    const summary: string[] = [];
    if (params.search) summary.push(`Búsqueda: "${params.search}"`);
    if (params.ccaa) summary.push(`CCAA: ${params.ccaa}`);
    if (params.category) summary.push(`Categoría: ${params.category}`);
    if (params.minScore > 0) summary.push(`Puntuación mín: ${params.minScore}`);
    if (params.budgetRange > 0) {
      const ranges = ['Todos', '<50K €', '50K-200K €', '200K-1M €', '>1M €'];
      summary.push(`Presupuesto: ${ranges[params.budgetRange]}`);
    }
    if (params.cpvFilter) summary.push(`CPV: ${params.cpvFilter}`);
    if (params.contractType && params.contractType !== 'all') {
      summary.push(params.contractType === 'minor' ? 'Contratos Menores' : 'Licitaciones Regulares');
    }
    return summary;
  };

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Búsquedas Guardadas</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gestiona tus búsquedas guardadas y recibe alertas por email cuando aparezcan nuevas licitaciones
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-muted/50 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : searches.length === 0 ? (
        <div className="bg-card rounded-xl p-12 text-center" style={{ boxShadow: 'var(--shadow-md)' }}>
          <BookmarkCheck className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="font-semibold text-lg mb-2">No tienes búsquedas guardadas</h3>
          <p className="text-muted-foreground text-sm mb-6">
            Realiza una búsqueda en la sección de Licitaciones y haz clic en "Guardar búsqueda" para empezar a recibir alertas
          </p>
          <Link href="/tenders">
            <Button className="gap-2">
              <Search className="w-4 h-4" /> Buscar Licitaciones
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {searches.map(search => {
            const summary = getSearchSummary(search.queryParams);
            const searchUrl = buildSearchUrl(search.queryParams);

            return (
              <div
                key={search.id}
                className="bg-card rounded-xl p-5 hover:shadow-lg transition-shadow"
                style={{ boxShadow: 'var(--shadow-sm)' }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">{search.name}</h3>
                      {search.emailAlerts && (
                        <span className="px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300 text-xs font-medium flex items-center gap-1">
                          <Bell className="w-3 h-3" /> Alertas activas
                        </span>
                      )}
                    </div>
                    
                    {summary.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {summary.map((item, i) => (
                          <span
                            key={i}
                            className="px-2 py-1 rounded-md bg-muted text-muted-foreground text-xs"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground">
                      Creada: {new Date(search.createdAt).toLocaleDateString('es-ES')} •
                      Actualizada: {new Date(search.updatedAt).toLocaleDateString('es-ES')}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <Link href={searchUrl}>
                      <Button variant="outline" size="sm" className="gap-2 w-full">
                        <ExternalLink className="w-4 h-4" /> Ver resultados
                      </Button>
                    </Link>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleAlerts(search.id, search.emailAlerts)}
                      className="gap-2"
                    >
                      {search.emailAlerts ? (
                        <><BellOff className="w-4 h-4" /> Desactivar alertas</>
                      ) : (
                        <><Bell className="w-4 h-4" /> Activar alertas</>
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteSearch(search.id)}
                      className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                    >
                      <Trash2 className="w-4 h-4" /> Eliminar
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
