export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/api-auth';

export async function GET() {
  const auth = await requireSession();
  if (auth.response) return auth.response;

  try {
    const notifications = await prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { tender: { select: { id: true, title: true, score: true } } },
    });
    const unreadCount = await prisma.notification.count({ where: { isRead: false } });
    return NextResponse.json({ notifications: notifications ?? [], unreadCount: unreadCount ?? 0 });
  } catch (error: any) {
    console.error('Notifications error:', error);
    return NextResponse.json({ notifications: [], unreadCount: 0 }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireSession();
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request?.url ?? '');
    const id = searchParams.get('id');
    const all = searchParams.get('all') === 'true';
    if (all) {
      await prisma.notification.deleteMany({});
    } else if (id) {
      await prisma.notification.delete({ where: { id } });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Notification delete error:', error);
    return NextResponse.json({ error: 'Error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireSession();
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const { id, markAllRead } = body ?? {};
    if (markAllRead) {
      await prisma.notification.updateMany({ where: { isRead: false }, data: { isRead: true } });
    } else if (id) {
      await prisma.notification.update({ where: { id }, data: { isRead: true } });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Notification update error:', error);
    return NextResponse.json({ error: 'Error' }, { status: 500 });
  }
}
