export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request?.url ?? '');
    const search = searchParams.get('search') ?? '';
    const type = searchParams.get('type') ?? '';

    const where: any = {};
    if (search) where.name = { contains: search, mode: 'insensitive' as any };
    if (type) where.type = type;

    const buyers = await prisma.buyer.findMany({ where, orderBy: { tenderCount: 'desc' } });
    return NextResponse.json({ buyers: buyers ?? [] });
  } catch (error: any) {
    console.error('Buyers error:', error);
    return NextResponse.json({ buyers: [] }, { status: 500 });
  }
}
