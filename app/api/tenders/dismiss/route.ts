export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

// POST: dismiss one or multiple tenders
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const body = await request.json();
    const { tenderId, tenderIds } = body;

    // Support single or batch dismiss
    const ids: string[] = tenderIds ?? (tenderId ? [tenderId] : []);
    if (ids.length === 0) return NextResponse.json({ error: 'Se requiere tenderId o tenderIds' }, { status: 400 });

    const result = await prisma.tender.updateMany({
      where: { id: { in: ids } },
      data: { dismissed: true, dismissedAt: new Date() },
    });

    return NextResponse.json({ success: true, dismissed: result.count });
  } catch (error: any) {
    console.error('Dismiss error:', error);
    return NextResponse.json({ error: 'Error al descartar' }, { status: 500 });
  }
}

// DELETE: restore a dismissed tender
export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const tenderId = searchParams.get('id');
    if (!tenderId) return NextResponse.json({ error: 'Se requiere id' }, { status: 400 });

    await prisma.tender.update({
      where: { id: tenderId },
      data: { dismissed: false, dismissedAt: null },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Restore error:', error);
    return NextResponse.json({ error: 'Error al restaurar' }, { status: 500 });
  }
}
