import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });
  return NextResponse.json({ user });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json();
  const { name, email, currentPassword, newPassword } = body || {};

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const data: any = {};
  if (typeof name === 'string' && name.trim()) data.name = name.trim();
  if (typeof email === 'string' && email.trim() && email !== user.email) {
    const exists = await prisma.user.findUnique({ where: { email: email.trim() } });
    if (exists) return NextResponse.json({ error: 'email_in_use' }, { status: 400 });
    data.email = email.trim();
  }

  if (newPassword) {
    if (!currentPassword) return NextResponse.json({ error: 'current_password_required' }, { status: 400 });
    const ok = await bcrypt.compare(currentPassword, user.password ?? '');
    if (!ok) return NextResponse.json({ error: 'invalid_password' }, { status: 400 });
    if (newPassword.length < 4) return NextResponse.json({ error: 'password_too_short' }, { status: 400 });
    data.password = await bcrypt.hash(newPassword, 10);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email } });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
    select: { id: true, name: true, email: true, role: true },
  });
  return NextResponse.json({ ok: true, user: updated });
}
