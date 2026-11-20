export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ favorites: [] });
    const userId = (session.user as any)?.id;
    const favorites = await prisma.favorite.findMany({
      where: { userId },
      include: { tender: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ favorites: favorites ?? [] });
  } catch (error: any) {
    console.error('Favorites error:', error);
    return NextResponse.json({ favorites: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const userId = (session.user as any)?.id;
    const body = await request.json();
    const { tenderId, notes } = body ?? {};
    if (!tenderId) return NextResponse.json({ error: 'tenderId requerido' }, { status: 400 });

    const existing = await prisma.favorite.findUnique({ where: { userId_tenderId: { userId, tenderId } } });
    if (existing) {
      await prisma.favorite.delete({ where: { id: existing.id } });
      return NextResponse.json({ removed: true });
    }
    const fav = await prisma.favorite.create({ data: { userId, tenderId, notes: notes ?? '' } });
    return NextResponse.json({ favorite: fav });
  } catch (error: any) {
    console.error('Favorite toggle error:', error);
    return NextResponse.json({ error: 'Error' }, { status: 500 });
  }
}
