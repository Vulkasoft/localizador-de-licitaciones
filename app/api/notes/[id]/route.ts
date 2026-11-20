import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateNoteSchema = z.object({
  titulo: z.string().min(1).optional(),
  descripcion: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  estado: z.enum(["PENDING", "DONE", "ATTEMPTED", "COMPLETED"]).optional(),
  budgetId: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  tenderId: z.string().optional().nullable(),
});

const noteInclude = {
  user: { select: { name: true, email: true } },
  budget: { select: { id: true, nombre: true, cliente: true } },
  customer: { select: { id: true, nombre: true } },
  tender: { select: { id: true, title: true } },
  files: { orderBy: { uploadedAt: "desc" } },
  alarms: { orderBy: { fechaLimite: "asc" } },
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const note = await prisma.note.findUnique({
      where: { id: params.id },
      include: noteInclude,
    });
    if (!note) {
      return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
    }
    return NextResponse.json({ note });
  } catch (error) {
    console.error("Error fetching note:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const existing = await prisma.note.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const data = updateNoteSchema.parse(body);

    const note = await prisma.note.update({
      where: { id: params.id },
      data,
      include: noteInclude,
    });

    return NextResponse.json({ note });
  } catch (error) {
    console.error("Error updating note:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validación fallida", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const existing = await prisma.note.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
    }

    await prisma.note.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting note:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
