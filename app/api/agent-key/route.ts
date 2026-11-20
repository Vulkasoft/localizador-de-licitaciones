export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

/**
 * Devuelve la clave API del agente SOLO a usuarios autenticados en la plataforma.
 * La clave vive en el backend (variable de entorno AGENT_API_KEY) y se muestra
 * en Ajustes para copiarla en ChatGPT. Nunca se expone sin sesión.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const key = process.env.AGENT_API_KEY ?? '';
  if (!key) {
    return NextResponse.json({ error: 'Clave no configurada' }, { status: 404 });
  }
  return NextResponse.json({ key, mcpUrl: '/api/mcp', restUrl: '/api/agent' });
}
