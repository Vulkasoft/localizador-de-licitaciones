import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const RC_STATUSES = [
  "PENDIENTE",
  "CONCEDIDA",
  "PEDIDO_REALIZADO",
  "RECHAZADA",
  "CANCELADA",
] as const;

const updateSchema = z.object({
  organismo: z.string().optional().nullable(),
  expediente: z.string().optional().nullable(),
  referencia: z.string().optional().nullable(),
  importe: z.union([z.number(), z.string()]).optional().nullable(),
  fechaSolicitud: z.string().optional().nullable(),
  fechaConcesion: z.string().optional().nullable(),
  numeroRC: z.string().optional().nullable(),
  estado: z.enum(RC_STATUSES).optional(),
  descripcion: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
});

function parseImporte(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const item = await prisma.creditRetention.findUnique({
      where: { id: params.id },
    });

    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ item });
  } catch (error) {
    console.error("Error fetching credit retention:", error);
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

    const existing = await prisma.creditRetention.findUnique({
      where: { id: params.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const data = updateSchema.parse(body);

    const item = await prisma.creditRetention.update({
      where: { id: params.id },
      data: {
        ...(data.organismo !== undefined && { organismo: data.organismo || null }),
        ...(data.expediente !== undefined && { expediente: data.expediente || null }),
        ...(data.referencia !== undefined && { referencia: data.referencia || null }),
        ...(data.importe !== undefined && { importe: parseImporte(data.importe) }),
        ...(data.fechaSolicitud !== undefined && {
          fechaSolicitud: data.fechaSolicitud ? new Date(data.fechaSolicitud) : null,
        }),
        ...(data.fechaConcesion !== undefined && {
          fechaConcesion: data.fechaConcesion ? new Date(data.fechaConcesion) : null,
        }),
        ...(data.numeroRC !== undefined && { numeroRC: data.numeroRC || null }),
        ...(data.estado !== undefined && { estado: data.estado }),
        ...(data.descripcion !== undefined && { descripcion: data.descripcion || null }),
        ...(data.notas !== undefined && { notas: data.notas || null }),
      },
    });

    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Error updating credit retention:", error);
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

    const existing = await prisma.creditRetention.findUnique({
      where: { id: params.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.creditRetention.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting credit retention:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
