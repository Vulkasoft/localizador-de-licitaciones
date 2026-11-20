import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pushEventToGoogle } from "@/lib/google-calendar";
import { z } from "zod";

const createEventSchema = z.object({
  titulo: z.string().min(1),
  descripcion: z.string().optional(),
  fechaHora: z.string().datetime(),
  lugar: z.string().optional(),
  budgetId: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const mes = searchParams.get("mes");
    const anio = searchParams.get("anio");

    let where: any = {};

    if (mes && anio) {
      const monthStart = new Date(parseInt(anio), parseInt(mes), 1);
      const monthEnd = new Date(parseInt(anio), parseInt(mes) + 1, 0, 23, 59, 59);
      where.fechaHora = {
        gte: monthStart,
        lte: monthEnd,
      };
    }

    const events = await prisma.event.findMany({
      where,
      include: { user: { select: { name: true } }, budget: { select: { nombre: true } } },
      orderBy: { fechaHora: "asc" },
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error("Error fetching events:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { titulo, descripcion, fechaHora, lugar, budgetId } = createEventSchema.parse(body);

    const event = await prisma.event.create({
      data: {
        userId: session.user.id,
        titulo,
        descripcion,
        fechaHora: new Date(fechaHora),
        lugar,
        budgetId: budgetId || null,
      },
      include: { user: { select: { name: true } }, budget: { select: { nombre: true } } },
    });

    // Best-effort push to Google Calendar (no-op if not connected).
    try {
      const gid = await pushEventToGoogle(session.user.id, event as any);
      if (gid) {
        await prisma.event.update({
          where: { id: event.id },
          data: { googleEventId: gid, syncedAt: new Date() },
        });
      }
    } catch (e) {
      console.error("Google push (create) failed:", e);
    }

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    console.error("Error creating event:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
