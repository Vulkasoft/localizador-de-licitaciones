import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ORDER_STATUSES = [
  "SOLICITADO",
  "CONFIRMADO",
  "EN_TRANSITO",
  "EN_ADUANA",
  "RECIBIDO",
  "INCIDENCIA",
  "CANCELADO",
] as const;

const createSchema = z.object({
  numeroAcopio: z.string().optional().nullable(),
  numeroPedido: z.string().optional().nullable(),
  numeroSeguimiento: z.string().optional().nullable(),
  referencia: z.string().optional().nullable(),
  referenciaTipo: z.string().optional().nullable(),
  budgetId: z.string().optional().nullable(),
  empresa: z.string().optional().nullable(),
  origen: z.string().optional().nullable(),
  quienPidio: z.string().optional().nullable(),
  fechaSolicitud: z.string().optional().nullable(),
  estado: z.enum(ORDER_STATUSES).default("SOLICITADO"),
  descripcion: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("query") || "").trim();
    const estado = searchParams.get("estado") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10))
    );

    const where: any = {};
    if (estado && ORDER_STATUSES.includes(estado as any)) {
      where.estado = estado;
    }
    if (query) {
      where.OR = [
        { numeroAcopio: { contains: query, mode: "insensitive" } },
        { numeroPedido: { contains: query, mode: "insensitive" } },
        { numeroSeguimiento: { contains: query, mode: "insensitive" } },
        { referencia: { contains: query, mode: "insensitive" } },
        { empresa: { contains: query, mode: "insensitive" } },
        { quienPidio: { contains: query, mode: "insensitive" } },
        { origen: { contains: query, mode: "insensitive" } },
      ];
    }

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        include: {
          files: { orderBy: { uploadedAt: "desc" } },
          budget: {
            select: {
              id: true,
              contasimpleNumber: true,
              numeroFactura: true,
              contasimpleCompany: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      orders,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    console.error("Error listing orders:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const data = createSchema.parse(body);

    const order = await prisma.order.create({
      data: {
        userId: session.user.id,
        numeroAcopio: data.numeroAcopio || null,
        numeroPedido: data.numeroPedido || null,
        numeroSeguimiento: data.numeroSeguimiento || null,
        referencia: data.referencia || null,
        referenciaTipo: data.referenciaTipo || null,
        budgetId: data.budgetId || null,
        empresa: data.empresa || null,
        origen: data.origen || null,
        quienPidio: data.quienPidio || null,
        fechaSolicitud: data.fechaSolicitud ? new Date(data.fechaSolicitud) : null,
        estado: data.estado,
        descripcion: data.descripcion || null,
        notas: data.notas || null,
      },
      include: {
        files: true,
        budget: {
          select: {
            id: true,
            contasimpleNumber: true,
            numeroFactura: true,
            contasimpleCompany: true,
          },
        },
      },
    });

    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Error creating order:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
