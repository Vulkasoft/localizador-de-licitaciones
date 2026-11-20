export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { scoreTender } from '@/lib/scoring';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const tender = await prisma.tender.findUnique({
      where: { id: params?.id },
      include: {
        customer: { select: { id: true, nombre: true, nif: true } },
        budgets: {
          orderBy: { createdAt: 'desc' },
          include: { customer: { select: { id: true, nombre: true } } },
        },
      },
    });
    if (!tender) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

    const breakdown = scoreTender(tender as any);
    const relatedTenders = await prisma.tender.findMany({
      where: { contractingBody: tender?.contractingBody, id: { not: tender?.id } },
      take: 5,
    });
    const buyer = await prisma.buyer.findFirst({ where: { name: tender?.contractingBody } });

    return NextResponse.json({ tender, breakdown, relatedTenders: relatedTenders ?? [], buyer });
  } catch (error: any) {
    console.error('Tender detail error:', error);
    return NextResponse.json({ error: 'Error al obtener licitación' }, { status: 500 });
  }
}

// PATCH: assign / unassign a customer to this tender
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const body = await request.json();
    const customerId = body?.customerId ?? null;

    const tender = await prisma.tender.update({
      where: { id: params.id },
      data: { customerId: customerId || null },
      include: { customer: { select: { id: true, nombre: true, nif: true } } },
    });
    return NextResponse.json({ tender });
  } catch (error: any) {
    console.error('Tender assign customer error:', error);
    return NextResponse.json({ error: 'Error al actualizar licitación' }, { status: 500 });
  }
}
