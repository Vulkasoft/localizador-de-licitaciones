'use client';
import { useState, useEffect } from 'react';
import { TrendingUp, Clock, MapPin, AlertTriangle, ScrollText, Filter, Search, ChevronDown, Contact, FileText, Euro } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { getScoreColor, CCAA_DATA } from '@/lib/spain-geo';

const SpainMap = dynamic(() => import('@/components/spain-map'), { ssr: false, loading: () => <div className="w-full h-[500px] bg-muted/50 rounded-xl animate-pulse flex items-center justify-center text-muted-foreground">Cargando mapa...</div> });

const PRIORITY_CCAAS = ['Canarias', 'Andalucía'];
const ALL_CCAAS = Object.keys(CCAA_DATA).sort();

interface DashboardData {
  kpis: { totalActive: number; expiringSoon: number; newThisWeek: number };
  withPliegos: number;
  docCoverage: { total: number; indexed: number; withPliegos: number };
  byCcaa: { ccaa: string; count: number; budget: number }[];
  expiringTenders: any[];
  lastRefresh: string | null;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  const [mapData, setMapData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCcaa, setSelectedCcaa] = useState<string>('');
  const [mapOpen, setMapOpen] = useState(false);
  const [topCustomers, setTopCustomers] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard').then((r: any) => r?.json?.()),
      fetch('/api/map').then((r: any) => r?.json?.()),
    ]).then(([dash, map]: any[]) => {
      setData(dash);
      setMapData(map);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/customers?withCounts=true').then((r: any) => r?.json?.()).then((d: any) => {
      const list = Array.isArray(d) ? d : (d?.customers ?? []);
      const sorted = [...list].sort((a: any, b: any) => {
        const ac = (a?._count?.budgets ?? 0) + (a?._count?.tenders ?? 0) + (a?._count?.notes ?? 0);
        const bc = (b?._count?.budgets ?? 0) + (b?._count?.tenders ?? 0) + (b?._count?.notes ?? 0);
        return bc - ac;
      }).filter((c: any) => ((c?._count?.budgets ?? 0) + (c?._count?.tenders ?? 0) + (c?._count?.notes ?? 0)) > 0);
      setTopCustomers(sorted.slice(0, 6));
    }).catch(() => {});
  }, []);

  if (loading) return <div className="space-y-6"><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[1,2,3,4].map((i: number) => <div key={i} className="h-28 bg-muted/50 rounded-xl animate-pulse" />)}</div><div className="h-[500px] bg-muted/50 rounded-xl animate-pulse" /></div>;

  const kpis = data?.kpis;

  const filterByCcaa = (tenders: any[]) => {
    if (!selectedCcaa) return tenders ?? [];
    return (tenders ?? []).filter((t: any) => {
      const r = t?.regionCcaa ?? '';
      return r === selectedCcaa || r === 'Ámbito Nacional' || r === 'Nacional';
    });
  };

  const filteredExpiring = filterByCcaa(data?.expiringTenders ?? []);

  const daysUntil = (d: string | Date | null | undefined): number | null => {
    if (!d) return null;
    return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };
  const urgencyColor = (days: number | null) => {
    if (days === null) return { bg: 'bg-muted', text: 'text-muted-foreground' };
    if (days <= 3) return { bg: 'bg-red-500/10', text: 'text-red-600' };
    if (days <= 7) return { bg: 'bg-orange-500/10', text: 'text-orange-600' };
    return { bg: 'bg-amber-500/10', text: 'text-amber-700' };
  };

  const filteredMarkers = selectedCcaa ? (mapData?.markers ?? []).filter((m: any) => {
    const r = m?.regionCcaa ?? '';
    return r === selectedCcaa || r === 'Ámbito Nacional' || r === 'Nacional';
  }) : (mapData?.markers ?? []);
  const filteredRegions = selectedCcaa ? (mapData?.regions ?? []).filter((r: any) => r?.ccaa === selectedCcaa || r?.ccaa === 'Ámbito Nacional') : (mapData?.regions ?? []);

  const ccaaCount = selectedCcaa ? (data?.byCcaa ?? []).find((c: any) => c?.ccaa === selectedCcaa)?.count ?? 0 : kpis?.totalActive ?? 0;

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Panel de Control</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Licitaciones de drones — solo oportunidades abiertas con documentación
          {data?.lastRefresh ? ` · ${new Date(data.lastRefresh).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
        </p>
      </div>

      {/* CCAA Filter */}
      <div className="bg-card rounded-xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-sky-500" />
          <span className="text-sm font-semibold">Comunidad Autónoma</span>
          {selectedCcaa && <span className="text-xs text-sky-600 bg-sky-500/10 px-2 py-0.5 rounded-full">{selectedCcaa} ({ccaaCount})</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setSelectedCcaa('')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${!selectedCcaa ? 'bg-sky-500 text-white shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>Toda España</button>
          {PRIORITY_CCAAS.map((c: string) => {
            const count = (data?.byCcaa ?? []).find((cc: any) => cc?.ccaa === c)?.count ?? 0;
            return (
              <button key={c} onClick={() => setSelectedCcaa(c === selectedCcaa ? '' : c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border-2 ${c === selectedCcaa ? 'bg-amber-500 text-white border-amber-500 shadow-sm' : 'bg-amber-500/5 text-amber-700 border-amber-400/50 hover:bg-amber-500/10'}`}>
                ★ {c} {count > 0 && <span className="opacity-75">({count})</span>}
              </button>
            );
          })}
          <div className="h-7 w-px bg-border mx-1" />
          {ALL_CCAAS.filter((c: string) => !PRIORITY_CCAAS.includes(c)).map((c: string) => {
            const count = (data?.byCcaa ?? []).find((cc: any) => cc?.ccaa === c)?.count ?? 0;
            if (count === 0) return null;
            return (
              <button key={c} onClick={() => setSelectedCcaa(c === selectedCcaa ? '' : c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${c === selectedCcaa ? 'bg-sky-500 text-white shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                {c} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI Cards — focused on what matters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard icon={ScrollText} label="Con Pliegos" value={data?.withPliegos ?? 0} color="text-emerald-500" bg="bg-emerald-500/10" href="/tenders" />
        <KpiCard icon={Clock} label="Vencen Pronto" value={kpis?.expiringSoon ?? 0} color="text-orange-500" bg="bg-orange-500/10" href="/tenders?expiring=true" />
        <KpiCard icon={TrendingUp} label="Nuevas Esta Semana" value={kpis?.newThisWeek ?? 0} color="text-violet-500" bg="bg-violet-500/10" href="/tenders?new=true" />
      </div>



      {/* Map (collapsible — only mounts MapLibre when opened to save resources) */}
      <div className="bg-card rounded-xl p-5" style={{ boxShadow: 'var(--shadow-md)' }}>
        <button
          onClick={() => setMapOpen((o: boolean) => !o)}
          className="w-full flex items-center gap-2 text-left"
          aria-expanded={mapOpen}
        >
          <MapPin className="w-5 h-5 text-sky-500 flex-shrink-0" />
          <h2 className="font-display font-semibold text-lg">Mapa{selectedCcaa ? ` — ${selectedCcaa}` : ''}</h2>
          <span className="text-xs bg-sky-500/15 text-sky-700 px-2 py-0.5 rounded-full font-medium">{filteredMarkers.length} en el mapa</span>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            {mapOpen ? 'Ocultar' : 'Mostrar'}
            <ChevronDown className={`w-4 h-4 transition-transform ${mapOpen ? 'rotate-180' : ''}`} />
          </span>
        </button>
        {mapOpen && (
          <div className="mt-4">
            <SpainMap markers={filteredMarkers} regions={filteredRegions} />
          </div>
        )}
      </div>

      {/* Urgent: Próximos Vencimientos */}
      {filteredExpiring.length > 0 && (
        <div className="bg-gradient-to-br from-orange-500/5 to-red-500/5 border border-orange-500/20 rounded-xl p-5" style={{ boxShadow: 'var(--shadow-md)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              <h2 className="font-display font-semibold">Próximos Vencimientos</h2>
              <span className="text-xs bg-orange-500/15 text-orange-700 px-2 py-0.5 rounded-full font-medium">{filteredExpiring.length}</span>
            </div>
            <Link href="/tenders?expiring=true" className="text-xs text-sky-600 hover:text-sky-700 font-medium">Ver todas →</Link>
          </div>
          <div className="space-y-2">
            {filteredExpiring.slice(0, 6).map((t: any) => {
              const days = daysUntil(t?.deadline);
              const u = urgencyColor(days);
              return (
                <Link key={t?.id} href={`/tenders/${t?.id}`} className="flex items-center gap-3 p-3 bg-card rounded-lg hover:shadow-md transition group">
                  <div className={`w-14 text-center px-2 py-1.5 rounded-lg font-mono font-bold text-sm flex-shrink-0 ${u.bg} ${u.text}`}>
                    {days === 0 ? 'HOY' : days === 1 ? '1 día' : `${days} días`}
                  </div>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center font-mono font-bold text-xs text-white flex-shrink-0" style={{ backgroundColor: getScoreColor(t?.score ?? 0) }}>{t?.score ?? 0}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-sky-600 transition">{t?.title ?? 'Sin título'}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span className="truncate">{t?.contractingBody ?? ''}</span>
                      {t?.budgetAmount > 0 && <span className="flex-shrink-0 font-mono">{(t.budgetAmount / 1000).toFixed(0)}K €</span>}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Clientes con actividad reciente */}
      {topCustomers.length > 0 && (
        <div className="bg-card rounded-xl p-5" style={{ boxShadow: 'var(--shadow-md)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Contact className="w-5 h-5 text-sky-500" />
              <h2 className="font-display font-semibold">Clientes con Actividad</h2>
            </div>
            <Link href="/clientes" className="text-xs text-sky-600 hover:text-sky-700 font-medium">Ver todos →</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {topCustomers.map((c: any) => (
              <Link key={c.id} href={`/clientes/${c.id}`} className="flex flex-col gap-2 p-4 rounded-xl border border-border/60 hover:shadow-md hover:border-sky-500/30 transition group" style={c?.color ? { borderLeftWidth: 4, borderLeftColor: c.color } : undefined}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold truncate group-hover:text-sky-600 transition">{c?.nombre ?? 'Sin nombre'}</p>
                  {c?.etiqueta && <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">{c.etiqueta}</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Euro className="w-3 h-3" /> {c?._count?.budgets ?? 0}</span>
                  <span className="inline-flex items-center gap-1"><FileText className="w-3 h-3" /> {c?._count?.tenders ?? 0}</span>
                  <span className="inline-flex items-center gap-1"><ScrollText className="w-3 h-3" /> {c?._count?.notes ?? 0}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

function KpiCard({ icon: Icon, label, value, format, color, bg, href }: { icon: any; label: string; value: number; format?: string; color: string; bg: string; href?: string }) {
  const display = format === 'currency' ? `${(value / 1000000).toFixed(1)}M€` : String(value ?? 0);
  const inner = (
    <div className={`bg-card rounded-xl p-5 flex items-center gap-4 ${href ? 'hover:shadow-lg hover:-translate-y-0.5 cursor-pointer' : ''} transition`} style={{ boxShadow: 'var(--shadow-md)' }}>
      <div className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center`}>
        <Icon className={`w-6 h-6 ${color}`} />
      </div>
      <div>
        <p className="text-2xl font-display font-bold tracking-tight">{display}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}