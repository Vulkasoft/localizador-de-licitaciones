'use client';
import { useState, useEffect } from 'react';
import { Heart, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { getScoreColor } from '@/lib/spain-geo';
import { CLASSIFICATION_LABELS } from '@/lib/scoring';

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    fetch('/api/favorites').then((r: any) => r?.json?.()).then((d: any) => {
      setFavorites(d?.favorites ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const removeFav = async (tenderId: string) => {
    await fetch('/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenderId }) });
    load();
  };

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight flex items-center gap-2"><Heart className="w-6 h-6 text-red-500" /> Favoritos</h1>
        <p className="text-muted-foreground text-sm mt-1">Licitaciones guardadas para seguimiento</p>
      </div>
      {loading ? <div className="space-y-3">{[1,2,3].map((i: number) => <div key={i} className="h-20 bg-muted/50 rounded-xl animate-pulse" />)}</div> :
        (favorites ?? []).length === 0 ? <div className="text-center py-16"><Heart className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" /><p className="text-muted-foreground">No tienes licitaciones favoritas</p><Link href="/tenders" className="text-sky-500 text-sm mt-2 inline-block">Explorar licitaciones</Link></div> :
        <div className="space-y-3">
          {(favorites ?? []).map((fav: any) => {
            const t = fav?.tender;
            return (
              <div key={fav?.id} className="bg-card rounded-xl p-4 flex items-center gap-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center font-mono font-bold text-sm text-white" style={{ backgroundColor: getScoreColor(t?.score ?? 0) }}>{t?.score ?? 0}</div>
                <div className="flex-1 min-w-0">
                  <Link href={`/tenders/${t?.id}`} className="text-sm font-semibold hover:text-sky-600 transition truncate block">{t?.title ?? ''}</Link>
                  <p className="text-xs text-muted-foreground">{t?.contractingBody ?? ''} · {(t?.budgetAmount ?? 0).toLocaleString('es-ES')}€</p>
                </div>
                <button onClick={() => removeFav(t?.id)} className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition"><Trash2 className="w-4 h-4" /></button>
              </div>
            );
          })}
        </div>
      }
    </div>
  );
}
