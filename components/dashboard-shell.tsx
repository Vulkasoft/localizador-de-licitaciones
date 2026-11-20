'use client';
import { useState, useCallback } from 'react';
import AppSidebar from './app-sidebar';
import AppHeader from './app-header';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshMsg('Iniciando búsqueda...');
    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      const reader = res?.body?.getReader();
      const decoder = new TextDecoder();
      let partialRead = '';
      while (true) {
        const { done, value } = await (reader?.read() ?? { done: true, value: undefined });
        if (done) break;
        partialRead += decoder.decode(value, { stream: true });
        let lines = partialRead.split('\n');
        partialRead = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data?.status === 'processing') setRefreshMsg(data?.message ?? '');
              else if (data?.status === 'completed') { setRefreshMsg(data?.result?.message ?? 'Completado'); setTimeout(() => { setRefreshMsg(''); window.location.reload(); }, 2000); }
              else if (data?.status === 'error') setRefreshMsg(data?.message ?? 'Error');
            } catch {}
          }
        }
      }
    } catch { setRefreshMsg('Error de conexión'); }
    setRefreshing(false);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className={`transition-all duration-300 ${collapsed ? 'md:ml-16' : 'md:ml-56'} min-h-screen flex flex-col`}>
        <AppHeader onRefresh={handleRefresh} refreshing={refreshing} onMobileMenu={() => setMobileOpen(true)} />
        {refreshMsg && (
          <div className="mx-3 sm:mx-6 mt-3 px-3 sm:px-4 py-2 rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-300 text-xs sm:text-sm flex items-center gap-2">
            {refreshing && <RefreshCwIcon />}
            <span className="truncate">{refreshMsg}</span>
          </div>
        )}
        <main className="p-3 sm:p-6 flex-1">{children}</main>
        <footer className="border-t border-border/60 mt-auto">
          <div className="px-3 sm:px-6 py-4 sm:py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs sm:text-sm text-muted-foreground">
            <div className="text-center sm:text-left" suppressHydrationWarning>© {new Date().getFullYear()} Localizador de Licitaciones</div>
            <div className="flex items-center gap-1.5">
              <span>Designed with</span>
              <span className="text-red-500 inline-block animate-heartbeat">❤</span>
              <span>by</span>
              <a href="mailto:jose.mora@localizandotudron.com" className="text-sky-600 dark:text-sky-400 font-medium hover:underline" suppressHydrationWarning>Jose Mora</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function RefreshCwIcon() {
  return <svg className="w-4 h-4 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M21 21v-5h-5" /></svg>;
}
