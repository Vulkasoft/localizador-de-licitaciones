import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { CalendarWithEvents } from '@/components/calendar-with-events';

export const dynamic = 'force-dynamic';

export default async function CalendarioPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/login');
  }
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold tracking-tight">Calendario</h1>
        <p className="text-muted-foreground text-sm mt-1">Eventos, reuniones y fechas clave de tus presupuestos y licitaciones</p>
      </div>
      <CalendarWithEvents />
    </div>
  );
}
