import DashboardShell from '@/components/dashboard-shell';

export default function DocumentosLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
