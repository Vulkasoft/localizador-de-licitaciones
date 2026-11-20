export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

/**
 * Registro de usuarios. Permitido solo si:
 *  - todavía no hay ningún usuario (el primero queda como administrador),
 *  - lo hace un usuario con rol "admin", o
 *  - ALLOW_SIGNUP=true en el entorno (registro abierto).
 */
async function signupAllowed(): Promise<{ allowed: boolean; firstUser: boolean }> {
  const count = await prisma.user.count();
  if (count === 0) return { allowed: true, firstUser: true };
  if (process.env.ALLOW_SIGNUP === 'true') return { allowed: true, firstUser: false };
  const session = await getServerSession(authOptions);
  return { allowed: (session?.user as any)?.role === 'admin', firstUser: false };
}

export async function POST(request: Request) {
  try {
    const { allowed, firstUser } = await signupAllowed();
    if (!allowed) {
      return NextResponse.json({ error: 'El registro está cerrado. Pide acceso a un administrador.' }, { status: 403 });
    }
    const body = await request.json();
    const { email, password, name } = body ?? {};
    if (!email || !password) {
      return NextResponse.json({ error: 'Email y contraseña son obligatorios' }, { status: 400 });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'El usuario ya existe' }, { status: 400 });
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashed, name: name ?? '', ...(firstUser ? { role: 'admin' } : {}) },
    });
    return NextResponse.json({ id: user?.id, email: user?.email, name: user?.name });
  } catch (error: any) {
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Error al crear usuario' }, { status: 500 });
  }
}
