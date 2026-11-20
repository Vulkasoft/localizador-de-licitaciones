'use client';
import { useState, useEffect, useRef } from 'react';
import { RefreshCw, User, Lock, LogOut, Menu } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';

export default function AppHeader({ onRefresh, refreshing, onMobileMenu }: { onRefresh: () => void; refreshing: boolean; onMobileMenu?: () => void }) {
  const { data: session } = useSession() || {};
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const initial = (session?.user?.name ?? session?.user?.email ?? 'U')?.[0]?.toUpperCase?.() ?? 'U';

  return (
    <header className="sticky top-0 z-30 h-14 bg-white/80 dark:bg-[#0f1d36]/80 backdrop-blur border-b border-border flex items-center justify-between px-3 sm:px-6 gap-2">
      <button onClick={onMobileMenu} className="md:hidden p-2 rounded-lg hover:bg-muted transition" aria-label="Menú">
        <Menu className="w-5 h-5" />
      </button>
      <div className="hidden md:block" />
      <div className="flex items-center gap-1.5 sm:gap-3">
        <button onClick={onRefresh} disabled={refreshing} className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 text-xs sm:text-sm font-medium transition disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{refreshing ? 'Actualizando...' : 'Actualizar datos'}</span>
          <span className="sm:hidden">{refreshing ? '...' : 'Actualizar'}</span>
        </button>

        <div ref={ref} className="relative pl-2 border-l border-border">
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-2 hover:opacity-80 transition"
            aria-label="Menú de usuario"
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <div className="w-8 h-8 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-600 dark:text-sky-400 font-medium text-sm">
              {initial}
            </div>
          </button>
          {open && (
            <div className="absolute right-0 mt-2 w-64 rounded-xl border border-border bg-white dark:bg-[#0f1d36] shadow-lg overflow-hidden z-40">
              <div className="px-4 py-3 border-b border-border">
                <p className="font-medium text-sm truncate">{session?.user?.name || 'Usuario'}</p>
                <p className="text-xs text-muted-foreground truncate">{session?.user?.email}</p>
              </div>
              <Link href="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition">
                <User className="w-4 h-4" /> Mi perfil
              </Link>
              <Link href="/profile?tab=password" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition">
                <Lock className="w-4 h-4" /> Cambiar contraseña
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition border-t border-border text-red-600 dark:text-red-400"
              >
                <LogOut className="w-4 h-4" /> Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
