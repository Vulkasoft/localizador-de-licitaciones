import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { splitProfit, parseMoney, monthKey } from "@/lib/profit-utils";
import { z } from "zod";

export const dynamic = "force-dynamic";

const PROFIT_STATUSES = ["PENDIENTE", "PAGADO"] as const;

const budgetInclude = {
  select: {
    id: true,
    contasimpleNumber: true,
    numeroFactura: true,
    contasimpleCompany: true,
  },
} as const;

const createSchema = z.object({
  concepto: z.string().optional().nullable(),
  referencia: z.string().optional().nullable(),
  referenciaTipo: z.string().optional().nullable(),
  budgetId: z.string().optional().nullable(),
  importeVenta: z.union([z.string(), z.number()]).optional().nullable(),
  beneficio: z.union([z.string(), z.number()]).optional().nullable(),
  estado: z.enum(PROFIT_STATUSES).default("PENDIENTE"),
  fechaVenta: z.string().optional().nullable(),
  fechaPago: z.string().optional().nullable(),
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
    const month = (searchParams.get("month") || "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10))
    );

    const where: any = {};
    if (estado && PROFIT_STATUSES.includes(estado as any)) {
      where.estado = estado;
    }
    if (query) {
      where.OR = [
        { concepto: { contains: query, mode: "insensitive" } },
        { referencia: { contains: query, mode: "insensitive" } },
        { notas: { contains: query, mode: "insensitive" } },
      ];
    }
    if (month) {
      // month = YYYY-MM -> filter fechaVenta within that month
      const [y, m] = month.split("-").map((v) => parseInt(v, 10));
      if (y && m) {
        const start = new Date(Date.UTC(y, m - 1, 1));
        const end = new Date(Date.UTC(y, m, 1));
        where.fechaVenta = { gte: start, lt: end };
      }
    }

    const [total, profitShares, allForSummary] = await Promise.all([
      prisma.profitShare.count({ where }),
      prisma.profitShare.findMany({
        where,
        include: {
          files: { orderBy: { uploadedAt: "desc" } },
          budget: budgetInclude,
        },
        orderBy: [{ fechaVenta: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      // Full filtered set (no pagination) for accurate monthly + global totals
      prisma.profitShare.findMany({
        where,
        select: {
          beneficio: true,
          parteVulkasoft: true,
          parteBluedrone: true,
          estado: true,
          fechaVenta: true,
        },
      }),
    ]);

    // Global totals
    const totals = {
      beneficio: 0,
      parteVulkasoft: 0,
      parteBluedrone: 0,
      pagado: 0,
      pendiente: 0,
      count: allForSummary.length,
      countPagado: 0,
      countPendiente: 0,
    };
    const monthsMap: Record<
      string,
      {
        key: string;
        beneficio: number;
        parteVulkasoft: number;
        parteBluedrone: number;
        pagado: number;
        pendiente: number;
        count: number;
      }
    > = {};

    for (const r of allForSummary) {
      totals.beneficio += r.beneficio || 0;
      totals.parteVulkasoft += r.parteVulkasoft || 0;
      totals.parteBluedrone += r.parteBluedrone || 0;
      if (r.estado === "PAGADO") {
        totals.pagado += r.parteVulkasoft || 0;
        totals.countPagado += 1;
      } else {
        totals.pendiente += r.parteVulkasoft || 0;
        totals.countPendiente += 1;
      }
      const key = monthKey(r.fechaVenta);
      if (!monthsMap[key]) {
        monthsMap[key] = {
          key,
          beneficio: 0,
          parteVulkasoft: 0,
          parteBluedrone: 0,
          pagado: 0,
          pendiente: 0,
          count: 0,
        };
      }
      const mm = monthsMap[key];
      mm.beneficio += r.beneficio || 0;
      mm.parteVulkasoft += r.parteVulkasoft || 0;
      mm.parteBluedrone += r.parteBluedrone || 0;
      mm.count += 1;
      if (r.estado === "PAGADO") mm.pagado += r.parteVulkasoft || 0;
      else mm.pendiente += r.parteVulkasoft || 0;
    }

    const months = Object.values(monthsMap).sort((a, b) => {
      if (a.key === "sin-fecha") return 1;
      if (b.key === "sin-fecha") return -1;
      return b.key.localeCompare(a.key);
    });

    return NextResponse.json({
      profitShares,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      summary: { totals, months },
    });
  } catch (error) {
    console.error("Error listing profit shares:", error);
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

    const beneficio = parseMoney(data.beneficio) ?? 0;
    const { parteVulkasoft, parteBluedrone } = splitProfit(beneficio);

    const profitShare = await prisma.profitShare.create({
      data: {
        userId: session.user.id,
        concepto: data.concepto || null,
        referencia: data.referencia || null,
        referenciaTipo: data.referenciaTipo || null,
        budgetId: data.budgetId || null,
        importeVenta: parseMoney(data.importeVenta),
        beneficio,
        parteVulkasoft,
        parteBluedrone,
        estado: data.estado,
        fechaVenta: data.fechaVenta ? new Date(data.fechaVenta) : null,
        fechaPago: data.fechaPago ? new Date(data.fechaPago) : null,
        notas: data.notas || null,
      },
      include: { files: true, budget: budgetInclude },
    });

    return NextResponse.json({ profitShare });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Error creating profit share:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
