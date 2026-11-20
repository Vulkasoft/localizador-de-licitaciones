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

const createSchema = z.object({
  organismo: z.string().optional().nullable(),
  expediente: z.string().optional().nullable(),
  referencia: z.string().optional().nullable(),
  importe: z.union([z.number(), z.string()]).optional().nullable(),
  fechaSolicitud: z.string().optional().nullable(),
  fechaConcesion: z.string().optional().nullable(),
  numeroRC: z.string().optional().nullable(),
  estado: z.enum(RC_STATUSES).default("PENDIENTE"),
  descripcion: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
});

function parseImporte(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
}

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
    if (estado && RC_STATUSES.includes(estado as any)) {
      where.estado = estado;
    }
    if (query) {
      where.OR = [
        { organismo: { contains: query, mode: "insensitive" } },
        { expediente: { contains: query, mode: "insensitive" } },
        { referencia: { contains: query, mode: "insensitive" } },
        { numeroRC: { contains: query, mode: "insensitive" } },
        { descripcion: { contains: query, mode: "insensitive" } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.creditRetention.count({ where }),
      prisma.creditRetention.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    console.error("Error listing credit retentions:", error);
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

    const item = await prisma.creditRetention.create({
      data: {
        userId: session.user.id,
        organismo: data.organismo || null,
        expediente: data.expediente || null,
        referencia: data.referencia || null,
        importe: parseImporte(data.importe),
        fechaSolicitud: data.fechaSolicitud ? new Date(data.fechaSolicitud) : null,
        fechaConcesion: data.fechaConcesion ? new Date(data.fechaConcesion) : null,
        numeroRC: data.numeroRC || null,
        estado: data.estado,
        descripcion: data.descripcion || null,
        notas: data.notas || null,
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
    console.error("Error creating credit retention:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
