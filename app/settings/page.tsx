'use client';
import { useState, useEffect } from 'react';
import { Settings, Bell, Mail, Save, Check, Bot, Copy, Eye, EyeOff, KeyRound } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import GoogleCalendarCard from '@/components/google-calendar-card';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agentKey, setAgentKey] = useState('');
  const [origin, setOrigin] = useState('');
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    fetch('/api/settings').then((r: any) => r?.json?.()).then((d: any) => {
      setSettings(d?.settings ?? {});
      setLoading(false);
    }).catch(() => setLoading(false));
    fetch('/api/agent-key').then((r: any) => (r?.ok ? r.json() : null)).then((d: any) => {
      if (d?.key) setAgentKey(d.key);
    }).catch(() => {});
  }, []);

  const copyKey = async () => {
    // navigator.clipboard puede estar bloqueado dentro de iframes/preview:
    // usamos un fallback con textarea + execCommand.
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(agentKey);
        toast.success('Clave API copiada al portapapeles');
        return;
      }
      throw new Error('clipboard no disponible');
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = agentKey;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) toast.success('Clave API copiada al portapapeles');
        else toast.error('No se pudo copiar. Muéstrala y cópiala manualmente.');
      } catch {
        toast.error('No se pudo copiar. Muéstrala y cópiala manualmente.');
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      toast.success('Ajustes guardados correctamente');
    } catch { toast.error('Error al guardar'); }
    setSaving(false);
  };

  const update = (key: string, value: string) => setSettings((prev: Record<string, string>) => ({ ...(prev ?? {}), [key]: value }));

  if (loading) return <div className="space-y-4">{[1,2,3].map((i: number) => <div key={i} className="h-20 bg-muted/50 rounded-xl animate-pulse" />)}</div>;

  return (
    <div className="space-y-6 max-w-[800px] mx-auto">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight flex items-center gap-2"><Settings className="w-6 h-6 text-sky-500" /> Ajustes</h1>
        <p className="text-muted-foreground text-sm mt-1">Configuración de notificaciones y preferencias</p>
      </div>

      <div className="bg-card rounded-xl p-6 space-y-6" style={{ boxShadow: 'var(--shadow-md)' }}>
        <div className="flex items-center gap-3 pb-4 border-b">
          <Bell className="w-5 h-5 text-sky-500" />
          <h2 className="font-display font-semibold">Notificaciones por Email</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Activar notificaciones</p>
              <p className="text-xs text-muted-foreground">Recibir alertas de nuevas licitaciones por email</p>
            </div>
            <button
              onClick={() => update('email_notifications', settings?.email_notifications === 'true' ? 'false' : 'true')}
              className={`w-12 h-6 rounded-full transition relative ${settings?.email_notifications === 'true' ? 'bg-sky-500' : 'bg-muted'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${settings?.email_notifications === 'true' ? 'left-6' : 'left-0.5'}`} />
            </button>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5 flex items-center gap-2"><Mail className="w-4 h-4" /> Email de notificaciones</label>
            <Input value={settings?.notification_email ?? ''} onChange={(e: any) => update('notification_email', e?.target?.value ?? '')} placeholder="tu@email.com" />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">Frecuencia</label>
            <select value={settings?.notification_frequency ?? 'daily'} onChange={(e: any) => update('notification_frequency', e?.target?.value ?? 'daily')} className="w-full px-3 py-2 rounded-lg border bg-background text-sm">
              <option value="instant">Instantánea</option>
              <option value="daily">Resumen diario</option>
              <option value="weekly">Resumen semanal</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">Puntuación mínima para alertas</label>
            <div className="flex items-center gap-3">
              <input type="range" min={0} max={100} value={parseInt(settings?.min_score_alert ?? '60')} onChange={(e: any) => update('min_score_alert', e?.target?.value ?? '60')} className="flex-1" />
              <span className="text-sm font-mono w-10">{settings?.min_score_alert ?? '60'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl p-6 space-y-4" style={{ boxShadow: 'var(--shadow-md)' }}>
        <div className="flex items-center gap-3 pb-4 border-b">
          <Bot className="w-5 h-5 text-sky-500" />
          <h2 className="font-display font-semibold">Agente de Presupuestos (IA)</h2>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Activar agente</p>
            <p className="text-xs text-muted-foreground">
              Permite que el agente externo acceda a las licitaciones y sus pliegos para leerlos, extraer la información y preparar presupuestos. Si está desactivado, el agente no podrá conectarse.
            </p>
          </div>
          <button
            onClick={() => update('agent_enabled', settings?.agent_enabled === 'true' ? 'false' : 'true')}
            className={`w-12 h-6 shrink-0 rounded-full transition relative ${settings?.agent_enabled === 'true' ? 'bg-sky-500' : 'bg-muted'}`}
            aria-label="Activar o desactivar agente"
            role="switch"
            aria-checked={settings?.agent_enabled === 'true'}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${settings?.agent_enabled === 'true' ? 'left-6' : 'left-0.5'}`} />
          </button>
        </div>

        <div className={`text-xs rounded-lg px-3 py-2 ${settings?.agent_enabled === 'true' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
          {settings?.agent_enabled === 'true'
            ? 'El agente está activado: puede consultar las licitaciones y descargar los pliegos.'
            : 'El agente está desactivado: cualquier intento de conexión será rechazado.'}
        </div>

        {agentKey && (
          <div className="space-y-2 pt-2 border-t">
            <label className="text-sm font-medium flex items-center gap-2"><KeyRound className="w-4 h-4" /> Clave API del agente</label>
            <p className="text-xs text-muted-foreground">
              Pégala en ChatGPT como token de acceso (esquema “Portador”). URL del servidor: <code className="font-mono bg-muted px-1 py-0.5 rounded">{origin}/api/mcp</code>
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-xs bg-muted px-3 py-2 rounded-lg overflow-x-auto whitespace-nowrap">
                {showKey ? agentKey : `${agentKey.slice(0, 6)}${'•'.repeat(20)}`}
              </code>
              <button onClick={() => setShowKey((v: boolean) => !v)} className="p-2 rounded-lg border hover:bg-muted transition" aria-label={showKey ? 'Ocultar clave' : 'Mostrar clave'}>
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button onClick={copyKey} className="p-2 rounded-lg border hover:bg-muted transition" aria-label="Copiar clave">
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <GoogleCalendarCard />

      <Button onClick={handleSave} disabled={saving} className="gap-2 bg-sky-500 hover:bg-sky-600 text-white">
        {saving ? <><Save className="w-4 h-4 animate-spin" /> Guardando...</> : <><Check className="w-4 h-4" /> Guardar Ajustes</>}
      </Button>
    </div>
  );
}
