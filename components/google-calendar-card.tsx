'use client';
import { useState, useEffect, useCallback } from 'react';
import { Calendar, RefreshCw, Link2, Unlink, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type Account = {
  email?: string | null;
  calendarId: string;
  calendarName?: string | null;
  syncDirection: string;
  lastSyncAt?: string | null;
};

type Cal = { id: string; summary: string; primary: boolean; accessRole?: string };

export default function GoogleCalendarCard() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [calendars, setCalendars] = useState<Cal[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [savingCfg, setSavingCfg] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/calendar/google/status');
      const d = await r.json();
      setConnected(!!d?.connected);
      setAccount(d?.account ?? null);
    } catch {}
    setLoading(false);
  }, []);

  const loadCalendars = useCallback(async () => {
    try {
      const r = await fetch('/api/calendar/google/calendars');
      if (!r.ok) return;
      const d = await r.json();
      setCalendars(d?.calendars ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (connected) loadCalendars();
  }, [connected, loadCalendars]);

  // Handle OAuth redirect result.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get('gcal');
    if (!g) return;
    if (g === 'connected') toast.success('Google Calendar conectado correctamente');
    else if (g === 'denied') toast.error('Se canceló la autorización de Google');
    else if (g === 'no_refresh') toast.error('No se recibió el permiso de acceso. Vuelve a intentarlo.');
    else if (g === 'error') toast.error('Error al conectar con Google Calendar');
    // Clean the URL.
    params.delete('gcal');
    const clean = window.location.pathname + (params.toString() ? `?${params}` : '');
    window.history.replaceState({}, '', clean);
  }, []);

  const connect = () => {
    window.location.href = '/api/calendar/google/authorize';
  };

  const disconnect = async () => {
    if (!confirm('¿Seguro que quieres desconectar Google Calendar? Los eventos ya sincronizados se conservarán como locales.')) return;
    try {
      await fetch('/api/calendar/google/disconnect', { method: 'POST' });
      setConnected(false);
      setAccount(null);
      setCalendars([]);
      toast.success('Google Calendar desconectado');
    } catch {
      toast.error('Error al desconectar');
    }
  };

  const saveConfig = async (patch: Partial<Account>) => {
    setSavingCfg(true);
    try {
      const r = await fetch('/api/calendar/google/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error();
      setAccount((prev) => (prev ? { ...prev, ...patch } as Account : prev));
      toast.success('Configuración guardada');
    } catch {
      toast.error('Error al guardar la configuración');
    }
    setSavingCfg(false);
  };

  const onCalendarChange = (id: string) => {
    const cal = calendars.find((c) => c.id === id);
    saveConfig({ calendarId: id, calendarName: cal?.summary ?? null });
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await fetch('/api/calendar/google/sync', { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error();
      toast.success(`Sincronizado: ${d.pushed} enviados, ${d.imported} importados, ${d.updated} actualizados, ${d.deleted ?? 0} eliminados`);
      loadStatus();
    } catch {
      toast.error('Error al sincronizar');
    }
    setSyncing(false);
  };

  return (
    <div className="bg-card rounded-xl p-6 space-y-4" style={{ boxShadow: 'var(--shadow-md)' }}>
      <div className="flex items-center gap-3 pb-4 border-b">
        <Calendar className="w-5 h-5 text-sky-500" />
        <h2 className="font-display font-semibold">Google Calendar</h2>
      </div>

      {loading ? (
        <div className="h-16 bg-muted/50 rounded-lg animate-pulse" />
      ) : !connected ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Conecta el calendario de tu empresa para sincronizar automáticamente los eventos del Calendario de la plataforma con Google Calendar.
          </p>
          <Button onClick={connect} className="gap-2 bg-sky-500 hover:bg-sky-600 text-white">
            <Link2 className="w-4 h-4" /> Conectar Google Calendar
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm rounded-lg px-3 py-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Check className="w-4 h-4" />
            Conectado{account?.email ? ` como ${account.email}` : ''}
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">Calendario a sincronizar</label>
            <select
              value={account?.calendarId ?? 'primary'}
              onChange={(e) => onCalendarChange(e.target.value)}
              disabled={savingCfg}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
            >
              {calendars.length === 0 && <option value={account?.calendarId ?? 'primary'}>Calendario principal</option>}
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.summary}{c.primary ? ' (principal)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">Dirección de sincronización</label>
            <select
              value={account?.syncDirection ?? 'bidirectional'}
              onChange={(e) => saveConfig({ syncDirection: e.target.value })}
              disabled={savingCfg}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
            >
              <option value="bidirectional">Bidireccional (recomendado)</option>
              <option value="push_only">Solo enviar a Google</option>
              <option value="read_only">Solo leer de Google</option>
            </select>
          </div>

          {account?.lastSyncAt && (
            <p className="text-xs text-muted-foreground">
              Última sincronización: {new Date(account.lastSyncAt).toLocaleString('es-ES', { timeZone: 'Atlantic/Canary' })}
            </p>
          )}

          <div className="flex items-center gap-2 pt-2 border-t">
            <Button onClick={sync} disabled={syncing} className="gap-2 bg-sky-500 hover:bg-sky-600 text-white">
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Sincronizando...' : 'Sincronizar ahora'}
            </Button>
            <Button onClick={disconnect} variant="outline" className="gap-2">
              <Unlink className="w-4 h-4" /> Desconectar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
