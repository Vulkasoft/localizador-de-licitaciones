'use client';
import { useState, useEffect } from 'react';
import { Users, Building2, Search, MapPin, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';

const BUYER_TYPES: Record<string, string> = {
  policia_local: 'Policía Local',
  bomberos: 'Bomberos',
  proteccion_civil: 'Protección Civil',
  guardia_civil: 'Guardia Civil',
  ayuntamiento: 'Ayuntamiento',
  diputacion: 'Diputación',
  cabildo: 'Cabildo Insular',
  gobierno_autonomico: 'Gobierno Autonómico',
  universidad: 'Universidad',
  empresa_publica: 'Empresa Pública',
};

const TYPE_COLORS: Record<string, string> = {
  policia_local: '#3b82f6',
  bomberos: '#ef4444',
  proteccion_civil: '#f97316',
  guardia_civil: '#22c55e',
  ayuntamiento: '#8b5cf6',
  diputacion: '#6366f1',
  cabildo: '#0ea5e9',
  gobierno_autonomico: '#14b8a6',
  universidad: '#a855f7',
  empresa_publica: '#64748b',
};

export default function BuyersPage() {
  const [buyers, setBuyers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (typeFilter) params.set('type', typeFilter);
    fetch(`/api/buyers?${params.toString()}`)
      .then((r: any) => r?.json?.())
      .then((d: any) => { setBuyers(d?.buyers ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [search, typeFilter]);

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight flex items-center gap-2"><Users className="w-6 h-6 text-sky-500" /> Directorio de Compradores</h1>
        <p className="text-muted-foreground text-sm mt-1">Organismos públicos que licitan drones y servicios relacionados</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e: any) => setSearch(e?.target?.value ?? '')} placeholder="Buscar comprador..." className="pl-10" />
        </div>
        <select value={typeFilter} onChange={(e: any) => setTypeFilter(e?.target?.value ?? '')} className="px-3 py-2 rounded-lg border bg-background text-sm">
          <option value="">Todos los tipos</option>
          {Object.entries(BUYER_TYPES).map(([k, v]: [string, string]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {loading ? <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1,2,3,4].map((i: number) => <div key={i} className="h-32 bg-muted/50 rounded-xl animate-pulse" />)}</div> :
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(buyers ?? []).map((b: any) => (
            <div key={b?.id} className="bg-card rounded-xl p-5 hover:shadow-lg transition-shadow" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: TYPE_COLORS[b?.type ?? ''] ?? '#64748b' }}>
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-sm">{b?.name ?? ''}</h3>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: TYPE_COLORS[b?.type ?? ''] ?? '#64748b' }}>{BUYER_TYPES[b?.type ?? ''] ?? b?.type ?? 'Otro'}</span>
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{b?.region ?? 'N/D'}</span>
                    <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{b?.tenderCount ?? 0} licitaciones</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      }
    </div>
  );
}
