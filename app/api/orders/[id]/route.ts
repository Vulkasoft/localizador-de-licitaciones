import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteFile } from "@/lib/s3-files";
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

const updateSchema = z.object({
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
  estado: z.enum(ORDER_STATUSES).optional(),
  descripcion: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const order = await prisma.order.findUnique({
      where: { id: params.id },
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
    });

    if (!order) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error("Error fetching order:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await prisma.order.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const data = updateSchema.parse(body);

    const order = await prisma.order.update({
      where: { id: params.id },
      data: {
        ...(data.numeroAcopio !== undefined && { numeroAcopio: data.numeroAcopio || null }),
        ...(data.numeroPedido !== undefined && { numeroPedido: data.numeroPedido || null }),
        ...(data.numeroSeguimiento !== undefined && { numeroSeguimiento: data.numeroSeguimiento || null }),
        ...(data.referencia !== undefined && { referencia: data.referencia || null }),
        ...(data.referenciaTipo !== undefined && { referenciaTipo: data.referenciaTipo || null }),
        ...(data.budgetId !== undefined && { budgetId: data.budgetId || null }),
        ...(data.empresa !== undefined && { empresa: data.empresa || null }),
        ...(data.origen !== undefined && { origen: data.origen || null }),
        ...(data.quienPidio !== undefined && { quienPidio: data.quienPidio || null }),
        ...(data.fechaSolicitud !== undefined && {
          fechaSolicitud: data.fechaSolicitud ? new Date(data.fechaSolicitud) : null,
        }),
        ...(data.estado !== undefined && { estado: data.estado }),
        ...(data.descripcion !== undefined && { descripcion: data.descripcion || null }),
        ...(data.notas !== undefined && { notas: data.notas || null }),
      },
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
    });

    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Error updating order:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: { files: true },
    });
    if (!order) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    for (const f of order.files) {
      try {
        await deleteFile(f.s3Key);
      } catch (e) {
        console.error("Error deleting order file from storage:", e);
      }
    }

    await prisma.order.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting order:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
