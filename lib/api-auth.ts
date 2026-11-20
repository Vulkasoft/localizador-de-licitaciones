import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

/**
 * Comprobaciones de acceso para rutas de la API.
 * Devuelven una respuesta 401 si no hay acceso, o null si se puede continuar:
 *
 *   const denied = await requireSession();
 *   if (denied) return denied;
 */

function unauthorized() {
  return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
}

/** true si la petición trae el secreto del cron (Authorization: Bearer ALARM_CRON_SECRET). */
export function isCronRequest(request: Request): boolean {
  const secret = process.env.ALARM_CRON_SECRET;
  return !!secret && request.headers.get('authorization') === `Bearer ${secret}`;
}

/** Exige un usuario con sesión iniciada. */
export async function requireSession(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  return session?.user ? null : unauthorized();
}

/** Exige sesión iniciada o el secreto del cron (para tareas programadas). */
export async function requireSessionOrCron(request: Request): Promise<NextResponse | null> {
  if (isCronRequest(request)) return null;
  return requireSession();
}
