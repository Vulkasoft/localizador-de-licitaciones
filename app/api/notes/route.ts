import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createNoteSchema = z.object({
  titulo: z.string().min(1),
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
  _count: { select: { alarms: true, files: true } },
} as const;

// GET: list notes with optional filters
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const budgetId = sp.get("budgetId") || undefined;
    const customerId = sp.get("customerId") || undefined;
    const tenderId = sp.get("tenderId") || undefined;
    const estado = sp.get("estado") || undefined;
    const search = sp.get("search") || undefined;
    const scope = sp.get("scope") || undefined; // "standalone" => sin vinculo
    const limit = Math.min(parseInt(sp.get("limit") || "500"), 1000);

    const where: any = {};
    if (budgetId) where.budgetId = budgetId;
    if (customerId) where.customerId = customerId;
    if (tenderId) where.tenderId = tenderId;
    if (scope === "standalone") {
      where.budgetId = null;
      where.customerId = null;
      where.tenderId = null;
    }
    if (estado === "ACTIVE") where.estado = { not: "COMPLETED" };
    else if (estado) where.estado = estado;
    if (search) {
      where.OR = [
        { titulo: { contains: search, mode: "insensitive" } },
        { descripcion: { contains: search, mode: "insensitive" } },
      ];
    }

    const notes = await prisma.note.findMany({
      where,
      include: noteInclude,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ notes });
  } catch (error) {
    console.error("Error fetching notes:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// POST: create a note (standalone or linked to budget/customer/tender)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const data = createNoteSchema.parse(body);

    const note = await prisma.note.create({
      data: {
        userId: session.user.id,
        titulo: data.titulo,
        descripcion: data.descripcion || null,
        color: data.color || null,
        estado: data.estado || "PENDING",
        budgetId: data.budgetId || null,
        customerId: data.customerId || null,
        tenderId: data.tenderId || null,
      },
      include: noteInclude,
    });

    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    console.error("Error creating note:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validación fallida", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
