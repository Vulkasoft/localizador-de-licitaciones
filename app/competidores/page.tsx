'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Trophy, Filter, Award, Euro, TrendingUp, Building2, MapPin } from 'lucide-react';
import { CCAA_DATA } from '@/lib/spain-geo';
import { CLASSIFICATION_LABELS } from '@/lib/scoring';

const PRIORITY_CCAAS = ['Canarias', 'Andalucía'];
const ALL_CCAAS = Object.keys(CCAA_DATA).sort();

function formatEuros(n: number) {
  if (!n) return '0 €';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M €`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K €`;
  return `${Math.round(n)} €`;
}

export default function CompetidoresPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [ccaa, setCcaa] = useState('');
  const [tab, setTab] = useState<'global' | 'porCcaa' | 'recientes'>('global');

  useEffect(() => {
    setLoading(true);
    const url = `/api/competitors${ccaa ? `?ccaa=${encodeURIComponent(ccaa)}` : ''}`;
    fetch(url).then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [ccaa]);

  const competitors = data?.competitors || [];
  const recentAwards = data?.recentAwards || [];
  const byRegion = data?.byRegion || [];

  // Group byRegion entries
  const regionGroups: Record<string, any[]> = {};
  for (const r of byRegion) {
    if (!regionGroups[r.ccaa]) regionGroups[r.ccaa] = [];
    if (regionGroups[r.ccaa].length < 5) regionGroups[r.ccaa].push(r);
  }

  const maxAwards = Math.max(...competitors.map((c: any) => c.awards), 1);

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center flex-shrink-0">
          <Trophy className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Competidores y Adjudicatarios</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Empresas que se llevan las licitaciones de drones — saber contra quién compites y a qué precios reales se adjudican los contratos.
          </p>
        </div>
      </div>

      {/* CCAA Filter */}
      <div className="bg-card rounded-xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-sky-500" />
          <span className="text-sm font-semibold">Filtrar por Comunidad Autónoma</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setCcaa('')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${!ccaa ? 'bg-sky-500 text-white shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>Toda España</button>
          {PRIORITY_CCAAS.map(c => (
            <button key={c} onClick={() => setCcaa(c === ccaa ? '' : c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border-2 ${c === ccaa ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-500/5 text-amber-700 border-amber-400/50 hover:bg-amber-500/10'}`}>★ {c}</button>
          ))}
          <div className="h-7 w-px bg-border mx-1" />
          {ALL_CCAAS.filter(c => !PRIORITY_CCAAS.includes(c)).map(c => (
            <button key={c} onClick={() => setCcaa(c === ccaa ? '' : c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${c === ccaa ? 'bg-sky-500 text-white shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>{c}</button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {[
          { id: 'global', label: 'Top Global', icon: Trophy },
          { id: 'porCcaa', label: 'Por CCAA', icon: MapPin },
          { id: 'recientes', label: 'Adjudicaciones recientes', icon: Award },
        ].map((t: any) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px flex items-center gap-1.5 ${
                tab === t.id ? 'border-sky-500 text-sky-600' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              <Icon className="w-4 h-4" />{t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-20 bg-muted/50 rounded-xl animate-pulse" />)}</div>
      ) : competitors.length === 0 ? (
        <div className="bg-card rounded-xl p-12 text-center" style={{ boxShadow: 'var(--shadow-md)' }}>
          <Trophy className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-lg font-medium">Sin adjudicaciones registradas{ccaa ? ` en ${ccaa}` : ''}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Los datos de competidores se completan a medida que las licitaciones se adjudican y aparece la información en PLACSP.
          </p>
        </div>
      ) : tab === 'global' ? (
        <div className="space-y-2">
          {competitors.slice(0, 30).map((c: any, i: number) => (
            <div key={c.name} className="bg-card rounded-xl p-4 flex items-center gap-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-mono font-bold flex-shrink-0 ${
                i === 0 ? 'bg-amber-500 text-white' : i === 1 ? 'bg-slate-400 text-white' : i === 2 ? 'bg-orange-700 text-white' : 'bg-muted text-muted-foreground'
              }`}>{i + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <p className="font-semibold truncate">{c.name}</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1"><Award className="w-3.5 h-3.5" />{c.awards} adjudicación{c.awards !== 1 ? 'es' : ''}</span>
                  {c.totalAmount > 0 && <span className="flex items-center gap-1"><Euro className="w-3.5 h-3.5" />{formatEuros(c.totalAmount)} total</span>}
                  {c.avgAmount > 0 && <span className="flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" />Media: {formatEuros(c.avgAmount)}</span>}
                </div>
                <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500" style={{ width: `${(c.awards / maxAwards) * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : tab === 'porCcaa' ? (
        <div className="space-y-4">
          {Object.entries(regionGroups).slice(0, 10).map(([region, list]) => (
            <div key={region} className="bg-card rounded-xl p-5" style={{ boxShadow: 'var(--shadow-md)' }}>
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4 text-sky-500" />
                <h3 className="font-display font-semibold">{region}</h3>
                <span className="text-xs text-muted-foreground">— Top adjudicatarios</span>
              </div>
              <div className="space-y-2">
                {list.map((entry: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-3 text-sm">
                    <div className="w-6 h-6 rounded bg-muted text-muted-foreground flex items-center justify-center text-xs font-mono flex-shrink-0">{idx + 1}</div>
                    <div className="flex-1 min-w-0 truncate">{entry.name}</div>
                    <div className="text-xs text-muted-foreground flex-shrink-0">
                      {entry.awards} · {formatEuros(entry.totalAmount)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {recentAwards.slice(0, 50).map((a: any) => (
            <Link key={a.id} href={`/tenders/${a.id}`}
              className="bg-card rounded-xl p-4 hover:shadow-md transition flex items-start gap-3 group" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <Award className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate group-hover:text-sky-600 transition">{a.title}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                  <span className="flex items-center gap-1 font-semibold text-foreground"><Trophy className="w-3.5 h-3.5 text-amber-500" />{a.awardedTo}</span>
                  {a.awardedAmount && <span>{formatEuros(a.awardedAmount)}</span>}
                  {a.awardedDate && <span>{new Date(a.awardedDate).toLocaleDateString('es-ES')}</span>}
                  {a.regionCcaa && <span>· {a.regionCcaa}</span>}
                  {a.classification && <span className="text-[10px] bg-sky-500/10 text-sky-600 px-1.5 py-0.5 rounded">{CLASSIFICATION_LABELS[a.classification] ?? a.classification}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
