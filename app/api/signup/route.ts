export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';

/**
 * POST /api/signup
 * El registro solo se permite si:
 *   - todavía no hay ningún usuario (el primero se crea como administrador), o
 *   - lo pide un usuario con sesión y role === 'admin', o
 *   - ALLOW_SIGNUP=true (registro abierto; desaconsejado en producción).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const { email, password, name } = body ?? {};
    if (!email || !password) {
      return NextResponse.json({ error: 'Email y contraseña son obligatorios' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const isAdmin = session?.user?.role === 'admin';
    const openSignup = process.env.ALLOW_SIGNUP === 'true';
    const hashed = await bcrypt.hash(password, 10);

    // Serializable: dos peticiones simultáneas no pueden crear ambas "el primer usuario".
    const result = await prisma.$transaction(
      async (tx) => {
        const isFirstUser = (await tx.user.count()) === 0;
        if (!isFirstUser && !isAdmin && !openSignup) return { forbidden: true as const };
        const existing = await tx.user.findUnique({ where: { email } });
        if (existing) return { exists: true as const };
        const user = await tx.user.create({
          data: { email, password: hashed, name: name ?? '', ...(isFirstUser ? { role: 'admin' } : {}) },
        });
        return { user };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if ('forbidden' in result) {
      return NextResponse.json(
        { error: 'El registro está cerrado. Pide a un administrador que te cree una cuenta.' },
        { status: 403 },
      );
    }
    if ('exists' in result) {
      return NextResponse.json({ error: 'El usuario ya existe' }, { status: 400 });
    }
    const { user } = result;
    return NextResponse.json({ id: user.id, email: user.email, name: user.name });
  } catch (error: any) {
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Error al crear usuario' }, { status: 500 });
  }
}
