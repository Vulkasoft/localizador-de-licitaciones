export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/api-auth';

export async function GET() {
  const denied = await requireSession();
  if (denied) return denied;
  try {
    const settings = await prisma.setting.findMany();
    const obj: Record<string, string> = {};
    (settings ?? []).forEach((s: any) => { obj[s?.key ?? ''] = s?.value ?? ''; });
    return NextResponse.json({ settings: obj });
  } catch (error: any) {
    return NextResponse.json({ settings: {} }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  try {
    const body = await request.json();
    const entries = Object.entries(body ?? {});
    for (const [key, value] of entries) {
      await prisma.setting.upsert({
        where: { key },
        update: { value: String(value ?? '') },
        create: { key, value: String(value ?? '') },
      });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al guardar' }, { status: 500 });
  }
}
