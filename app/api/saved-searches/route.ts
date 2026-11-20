export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        savedSearches: {
          orderBy: { updatedAt: 'desc' }
        }
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Parse queryParams JSON for each search
    const searches = user.savedSearches.map(s => ({
      ...s,
      queryParams: JSON.parse(s.queryParams)
    }));

    return NextResponse.json({ searches });
  } catch (error: any) {
    console.error('GET saved searches error:', error);
    return NextResponse.json({ error: 'Error al obtener búsquedas guardadas' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const { id, name, queryParams, emailAlerts } = body;

    if (!name || !queryParams) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    }

    // If id is provided, update existing search
    if (id) {
      const updated = await prisma.savedSearch.update({
        where: { id, userId: user.id },
        data: {
          name,
          queryParams: JSON.stringify(queryParams),
          emailAlerts: emailAlerts ?? true
        }
      });
      return NextResponse.json({ search: updated });
    }

    // Otherwise, create new search
    const search = await prisma.savedSearch.create({
      data: {
        userId: user.id,
        name,
        queryParams: JSON.stringify(queryParams),
        emailAlerts: emailAlerts ?? true
      }
    });

    return NextResponse.json({ search });
  } catch (error: any) {
    console.error('POST saved search error:', error);
    return NextResponse.json({ error: 'Error al guardar búsqueda' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    }

    await prisma.savedSearch.delete({
      where: { id, userId: user.id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE saved search error:', error);
    return NextResponse.json({ error: 'Error al eliminar búsqueda' }, { status: 500 });
  }
}
