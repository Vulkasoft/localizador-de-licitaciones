'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { LayoutDashboard, Search, Heart, Settings, LogOut, Plane, X, Trash2, FileSpreadsheet, Bell, StickyNote, Calendar, Receipt, Contact, BadgeEuro, Package, CheckCircle2, Landmark, PiggyBank, PackageSearch } from 'lucide-react';

const NAV = [
  { heading: 'Licitaciones' },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tenders', label: 'Licitaciones', icon: Search },
  { href: '/favorites', label: 'Favoritos', icon: Heart },
  { href: '/papelera', label: 'Papelera', icon: Trash2 },
  { heading: 'Gestión DJI' },
  { href: '/clientes', label: 'Clientes', icon: Contact },
  { href: '/productos', label: 'Buscar Producto', icon: PackageSearch },
  { href: '/budgets', label: 'Presupuestos', icon: FileSpreadsheet },
  { href: '/facturacion', label: 'Facturación', icon: BadgeEuro },
  { href: '/rc', label: 'Pendiente de RC', icon: Landmark },
  { href: '/orders', label: 'Pedidos', icon: Package },
  { href: '/beneficios', label: 'Beneficios', icon: PiggyBank },
  { href: '/alarms', label: 'Alarmas', icon: Bell },
  { href: '/notes', label: 'Seguimiento', icon: StickyNote },
  { href: '/notes/completadas', label: 'Tareas completadas', icon: CheckCircle2 },
  { href: '/calendario', label: 'Calendario', icon: Calendar },
  { href: '/contasimple', label: 'Contasimple', icon: Receipt },
  { heading: 'Cuenta' },
  { href: '/settings', label: 'Ajustes', icon: Settings },
];

export default function AppSidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: { collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onMobileClose: () => void }) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={onMobileClose} />
      )}
      <aside className={`fixed left-0 top-0 h-full z-50 transition-transform duration-300 bg-[#0f1d36] border-r border-white/5 flex flex-col
        ${collapsed ? 'md:w-16' : 'md:w-56'} w-64
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="flex items-center gap-3 px-4 py-5 border-b border-white/5">
          <button onClick={onToggle} className="text-sky-400 hover:text-sky-300 transition hidden md:block">
            <Plane className="w-7 h-7" />
          </button>
          <Plane className="w-7 h-7 text-sky-400 md:hidden" />
          {(!collapsed || mobileOpen) && <span className="text-white font-display font-bold text-sm truncate flex-1">Localizador Drones</span>}
          <button onClick={onMobileClose} className="md:hidden text-slate-400 hover:text-white" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 py-3 space-y-1 px-2 overflow-y-auto">
          {NAV.map((item: any, idx: number) => {
            if (item?.heading) {
              if (collapsed && !mobileOpen) return <div key={`h-${idx}`} className="my-2 border-t border-white/5" />;
              return <div key={`h-${idx}`} className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{item.heading}</div>;
            }
            const Icon = item?.icon;
            let active = pathname?.startsWith(item?.href);
            // Keep "Seguimiento" (/notes) from staying active on the completed page
            if (item?.href === '/notes' && pathname?.startsWith('/notes/completadas')) active = false;
            return (
              <Link key={item?.href} href={item?.href} onClick={onMobileClose} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${active ? 'bg-sky-500/15 text-sky-400' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                <Icon className="w-5 h-5 flex-shrink-0" />
                {(!collapsed || mobileOpen) && <span className="truncate">{item?.label}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="px-2 pb-4">
          <button onClick={() => signOut({ callbackUrl: '/login' })} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition w-full">
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {(!collapsed || mobileOpen) && <span>Cerrar Sesión</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
