import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  titulo: z.string().min(1).optional(),
  descripcion: z.string().optional().nullable(),
  fechaLimite: z.string().min(1, "La fecha límite es obligatoria"),
  diasAntelacion: z.number().int().min(0).default(1),
  emailsDestino: z.string().min(1, "Debe indicar al menos un email"),
});

// GET: list alarms for a note
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const alarms = await prisma.alarm.findMany({
      where: { noteId: params.id },
      orderBy: { fechaLimite: "asc" },
    });
    return NextResponse.json({ alarms });
  } catch (error) {
    console.error("Error fetching note alarms:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// POST: create an email alarm linked to a note
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const note = await prisma.note.findUnique({ where: { id: params.id } });
    if (!note) {
      return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const data = createSchema.parse(body);

    const alarm = await prisma.alarm.create({
      data: {
        userId: session.user.id,
        noteId: params.id,
        titulo: data.titulo?.trim() || note.titulo,
        descripcion: data.descripcion || note.descripcion || null,
        fechaLimite: new Date(data.fechaLimite),
        diasAntelacion: data.diasAntelacion,
        emailsDestino: data.emailsDestino,
      },
    });

    return NextResponse.json({ alarm }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Error creating note alarm:", error);
    return NextResponse.json({ error: "Error al crear la alarma" }, { status: 500 });
  }
}
