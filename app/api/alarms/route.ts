import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createAlarmSchema = z.object({
  titulo: z.string().min(1, "El título es obligatorio"),
  descripcion: z.string().optional().nullable(),
  fechaLimite: z.string().min(1, "La fecha límite es obligatoria"),
  diasAntelacion: z.number().int().min(0).default(1),
  emailsDestino: z.string().min(1, "Debe indicar al menos un email"),
  documentos: z.string().optional().nullable(),
  budgetId: z.string().optional().nullable(),
  tenderId: z.string().optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const estado = searchParams.get("estado");
    const tenderId = searchParams.get("tenderId");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (tenderId) {
      // Alarms for a specific tender (used by the tender detail panel).
      where.tenderId = tenderId;
    } else {
      // Main Alarmas list: exclude alarms created from Seguimiento (notes) —
      // those are managed within their note, not in the main list.
      where.noteId = null;
    }
    if (estado && estado !== "TODAS") {
      where.estado = estado;
    }

    const [alarms, total] = await Promise.all([
      prisma.alarm.findMany({
        where,
        include: {
          user: { select: { name: true, email: true } },
          budget: { select: { id: true, nombre: true, cliente: true, tipo: true } },
          tender: { select: { id: true, title: true } },
          alarmFiles: true,
        },
        orderBy: { fechaLimite: "asc" },
        skip,
        take: limit,
      }),
      prisma.alarm.count({ where }),
    ]);

    return NextResponse.json({ alarms, total, page, limit });
  } catch (error) {
    console.error("Error fetching alarms:", error);
    return NextResponse.json({ error: "Error al obtener alarmas" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const data = createAlarmSchema.parse(body);

    const alarm = await prisma.alarm.create({
      data: {
        userId: session.user.id,
        titulo: data.titulo,
        descripcion: data.descripcion || null,
        fechaLimite: new Date(data.fechaLimite),
        diasAntelacion: data.diasAntelacion,
        emailsDestino: data.emailsDestino,
        documentos: data.documentos || null,
        budgetId: data.budgetId || null,
        tenderId: data.tenderId || null,
      },
      include: {
        user: { select: { name: true, email: true } },
        budget: { select: { id: true, nombre: true, cliente: true } },
        tender: { select: { id: true, title: true } },
        alarmFiles: true,
      },
    });

    return NextResponse.json(alarm, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Error creating alarm:", error);
    return NextResponse.json({ error: "Error al crear la alarma" }, { status: 500 });
  }
}
