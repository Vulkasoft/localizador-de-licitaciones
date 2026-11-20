import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const budgetFilterSchema = z.object({
  search: z.string().optional(),
  estado: z.string().optional(),
  tipo: z.string().optional(),
  comunidad: z.string().optional(),
  sede: z.string().optional(),
  numero: z.string().optional(),
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  sortBy: z.string().optional(),
  page: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;

    // Distinct list of provinces (comunidadAutonoma actually stores province
    // names) present in the data, so the province filter dropdown only offers
    // values that actually match records.
    if (searchParams.get("distinctProvincias")) {
      const rows = await prisma.budget.findMany({
        where: { comunidadAutonoma: { not: null } },
        distinct: ["comunidadAutonoma"],
        select: { comunidadAutonoma: true },
        orderBy: { comunidadAutonoma: "asc" },
      });
      const provincias = rows
        .map((r) => r.comunidadAutonoma)
        .filter((v): v is string => !!v && v.trim().length > 0);
      return NextResponse.json({ provincias });
    }

    const params = budgetFilterSchema.parse({
      search: searchParams.get("search") || undefined,
      estado: searchParams.get("estado") || undefined,
      tipo: searchParams.get("tipo") || undefined,
      comunidad: searchParams.get("comunidad") || undefined,
      sede: searchParams.get("sede") || undefined,
      numero: searchParams.get("numero") || undefined,
      fechaDesde: searchParams.get("fechaDesde") || undefined,
      fechaHasta: searchParams.get("fechaHasta") || undefined,
      sortBy: searchParams.get("sortBy") || undefined,
      page: searchParams.get("page") || undefined,
      limit: searchParams.get("limit") || undefined,
    });

    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const skip = (page - 1) * limit;

    const whereClause: any = {};

    const andConditions: any[] = [];

    if (params.search) {
      andConditions.push({
        OR: [
          { cliente: { contains: params.search, mode: "insensitive" } },
          { nombre: { contains: params.search, mode: "insensitive" } },
          { ciudad: { contains: params.search, mode: "insensitive" } },
        ],
      });
    }

    if (params.estado) {
      // When filtering by PENDIENTE, include all pending states
      if (params.estado === "PENDIENTE") {
        andConditions.push({
          OR: [
            { estado: "PENDIENTE" },
            { estado: "PENDIENTE_MORA" },
            { estado: "PENDIENTE_OROZCO" },
            { estado: "PENDIENTE_RETENCION_CREDITO" },
          ],
        });
      } else {
        andConditions.push({ estado: params.estado });
      }
    }

    if (params.tipo) {
      andConditions.push({ tipo: params.tipo });
    }

    if (params.comunidad) {
      andConditions.push({ comunidadAutonoma: params.comunidad });
    }

    if (params.sede === "peninsula" || params.sede === "canarias") {
      andConditions.push({ contasimpleCompany: params.sede });
    }

    if (params.numero) {
      andConditions.push({ contasimpleNumber: { contains: params.numero, mode: "insensitive" } });
    }

    if (params.fechaDesde || params.fechaHasta) {
      const fechaCond: any = {};
      if (params.fechaDesde) fechaCond.gte = new Date(params.fechaDesde);
      if (params.fechaHasta) {
        // Include the whole "hasta" day.
        const hasta = new Date(params.fechaHasta);
        hasta.setHours(23, 59, 59, 999);
        fechaCond.lte = hasta;
      }
      andConditions.push({ fechaSolicitud: fechaCond });
    }

    const customerId = searchParams.get("customerId") || undefined;
    if (customerId) {
      andConditions.push({ customerId });
    }

    const tenderId = searchParams.get("tenderId") || undefined;
    if (tenderId) {
      andConditions.push({ tenderId });
    }

    // Apply all conditions with AND if there are multiple
    if (andConditions.length > 0) {
      if (andConditions.length === 1) {
        Object.assign(whereClause, andConditions[0]);
      } else {
        whereClause.AND = andConditions;
      }
    }

    const orderByMap: Record<string, any> = {
      fecha_desc: { fechaSolicitud: { sort: "desc", nulls: "last" } },
      fecha_asc: { fechaSolicitud: { sort: "asc", nulls: "last" } },
      total_desc: { totalConIva: { sort: "desc", nulls: "last" } },
      total_asc: { totalConIva: { sort: "asc", nulls: "last" } },
      reciente: { createdAt: "desc" },
      antiguo: { createdAt: "asc" },
    };
    const orderBy = orderByMap[params.sortBy ?? ""] ?? { createdAt: "desc" };

    const [budgets, total] = await Promise.all([
      prisma.budget.findMany({
        where: whereClause,
        include: {
          user: true,
          files: true,
          customer: { select: { id: true, nombre: true } },
          notes: {
            include: { user: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.budget.count({ where: whereClause }),
    ]);

    return NextResponse.json({
      budgets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching budgets:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

const emptyToNull = (s: any) => (typeof s === "string" && s.trim() === "" ? null : s);
const createBudgetSchema = z.object({
  nombre: z.preprocess(emptyToNull, z.string().nullable().optional()),
  cliente: z.preprocess(emptyToNull, z.string().nullable().optional()),
  comunidadAutonoma: z.preprocess(emptyToNull, z.string().nullable().optional()),
  ciudad: z.preprocess(emptyToNull, z.string().nullable().optional()),
  tipo: z.enum(["LICITACION", "CONTRATO_MENOR", "NORMAL", "OTRO"]).default("NORMAL"),
  tipoCustom: z.preprocess(emptyToNull, z.string().nullable().optional()),
  fechaSolicitud: z.preprocess(emptyToNull, z.string().nullable().optional()).transform((s: any) => s ? new Date(s) : null),
  fechaEntrega: z.preprocess(emptyToNull, z.string().nullable().optional()).transform((s: any) => s ? new Date(s) : null),
  fechaPlazo: z.preprocess(emptyToNull, z.string().nullable().optional()).transform((s: any) => s ? new Date(s) : null),
  estado: z.enum(["PENDIENTE", "PENDIENTE_MORA", "PENDIENTE_OROZCO", "PENDIENTE_RETENCION_CREDITO", "LICITACION_ENVIADA", "PRESUPUESTO_ENVIADO", "ENTREGADO", "PAGADO"]).default("PENDIENTE"),
  descripcion: z.preprocess(emptyToNull, z.string().nullable().optional()),
  notas: z.preprocess(emptyToNull, z.string().nullable().optional()),
  customerId: z.preprocess(emptyToNull, z.string().nullable().optional()),
  tenderId: z.preprocess(emptyToNull, z.string().nullable().optional()),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createBudgetSchema.parse(body);

    const budget = await prisma.budget.create({
      data: {
        ...validatedData,
        userId: session.user.id,
      },
      include: {
        user: true,
        files: true,
        notes: {
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        budgetId: budget.id,
        userId: session.user.id,
        accion: "CREATE",
        detalles: `Presupuesto creado: ${budget.nombre ?? "(sin nombre)"}`,
      },
    });

    return NextResponse.json(budget, { status: 201 });
  } catch (error) {
    console.error("Error creating budget:", error);
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
