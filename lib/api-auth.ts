import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getServerSession, Session } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

/**
 * Devuelve la sesión del usuario o una respuesta 401 lista para devolver.
 *
 *   const auth = await requireSession();
 *   if (auth.response) return auth.response;
 *   // auth.session está disponible
 */
export async function requireSession(): Promise<
  { session: Session; response?: undefined } | { session?: undefined; response: NextResponse }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { response: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  }
  return { session };
}

/**
 * true si la petición trae `Authorization: Bearer ${ALARM_CRON_SECRET}`
 * (la usa el contenedor cron, ver scripts/cron/run-job.sh).
 * Si ALARM_CRON_SECRET no está definido, nunca acepta.
 */
export function isCronRequest(req: Request): boolean {
  const secret = process.env.ALARM_CRON_SECRET;
  if (!secret) return false;
  const supplied = req.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Acepta el secreto de cron o, si no lo trae, exige sesión. */
export async function requireSessionOrCron(req: Request): Promise<NextResponse | null> {
  if (isCronRequest(req)) return null;
  const auth = await requireSession();
  return auth.response ?? null;
}
