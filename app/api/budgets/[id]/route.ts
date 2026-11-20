import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { deleteEstimate } from "@/lib/contasimple";
import { resolveCompanyForEstimate } from "@/lib/contasimple-sync";
import { contasimpleErrorMessage } from "@/lib/contasimple-error";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const budget = await prisma.budget.findUnique({
      where: { id: params.id },
      include: {
        user: true,
        files: true,
        auditLogs: true,
        customer: { select: { id: true, nombre: true, nif: true } },
        notes: {
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!budget) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(budget);
  } catch (error) {
    console.error("Error fetching budget:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

const emptyToNull = (s: any) => (typeof s === "string" && s.trim() === "" ? null : s);
const updateBudgetSchema = z.object({
  nombre: z.preprocess(emptyToNull, z.string().nullable().optional()),
  cliente: z.preprocess(emptyToNull, z.string().nullable().optional()),
  comunidadAutonoma: z.preprocess(emptyToNull, z.string().nullable().optional()),
  ciudad: z.preprocess(emptyToNull, z.string().nullable().optional()),
  tipo: z.enum(["LICITACION", "CONTRATO_MENOR", "NORMAL", "OTRO"]).optional(),
  tipoCustom: z.preprocess(emptyToNull, z.string().nullable().optional()),
  fechaSolicitud: z.preprocess(emptyToNull, z.string().nullable().optional()).transform((s: any) => s ? new Date(s) : null),
  fechaEntrega: z.preprocess(emptyToNull, z.string().nullable().optional()).transform((s: any) => s ? new Date(s) : null),
  fechaPlazo: z.preprocess(emptyToNull, z.string().nullable().optional()).transform((s: any) => s ? new Date(s) : null),
  estado: z.enum(["PENDIENTE", "PENDIENTE_MORA", "PENDIENTE_OROZCO", "PENDIENTE_RETENCION_CREDITO", "LICITACION_ENVIADA", "PRESUPUESTO_ENVIADO", "ENTREGADO", "PAGADO"]).optional(),
  descripcion: z.preprocess(emptyToNull, z.string().nullable().optional()),
  notas: z.preprocess(emptyToNull, z.string().nullable().optional()),
  customerId: z.preprocess(emptyToNull, z.string().nullable().optional()),
  tenderId: z.preprocess(emptyToNull, z.string().nullable().optional()),
  facturado: z.boolean().optional(),
  numeroFactura: z.preprocess(emptyToNull, z.string().nullable().optional()),
  fechaFactura: z.preprocess(emptyToNull, z.string().nullable().optional()).transform((s: any) => s ? new Date(s) : null),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const budget = await prisma.budget.findUnique({
      where: { id: params.id },
    });

    if (!budget) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const validatedData = updateBudgetSchema.parse(body);

    // Compute changes for audit log
    const fieldLabels: Record<string, string> = {
      nombre: "Nombre",
      cliente: "Cliente",
      comunidadAutonoma: "Comunidad",
      ciudad: "Ciudad",
      tipo: "Tipo",
      tipoCustom: "Tipo personalizado",
      fechaSolicitud: "Fecha Solicitud",
      fechaEntrega: "Fecha Entrega",
      fechaPlazo: "Fecha Plazo",
      estado: "Estado",
      descripcion: "Descripción",
      notas: "Notas",
      facturado: "Facturado",
      numeroFactura: "Nº Factura",
      fechaFactura: "Fecha Factura",
    };
    const fmt = (v: any): string => {
      if (v === null || v === undefined || v === "") return "(vacío)";
      if (v instanceof Date) return v.toLocaleDateString("es-ES");
      const s = String(v);
      return s.length > 60 ? s.slice(0, 60) + "…" : s;
    };
    const changes: string[] = [];
    for (const key of Object.keys(validatedData) as (keyof typeof validatedData)[]) {
      const newVal: any = (validatedData as any)[key];
      const oldVal: any = (budget as any)[key];
      const sameDate =
        newVal instanceof Date && oldVal instanceof Date
          ? newVal.getTime() === oldVal.getTime()
          : false;
      if (sameDate) continue;
      if (newVal instanceof Date || oldVal instanceof Date) {
        if (
          (newVal?.getTime?.() ?? null) === (oldVal?.getTime?.() ?? null)
        )
          continue;
      } else if (newVal === oldVal) {
        continue;
      } else if ((newVal ?? null) === (oldVal ?? null)) {
        continue;
      }
      const label = fieldLabels[key as string] ?? (key as string);
      changes.push(`${label}: "${fmt(oldVal)}" → "${fmt(newVal)}"`);
    }

    const updatedBudget = await prisma.budget.update({
      where: { id: params.id },
      data: validatedData,
      include: {
        user: true,
        files: true,
        customer: { select: { id: true, nombre: true, nif: true } },
        notes: {
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (changes.length > 0) {
      await prisma.auditLog.create({
        data: {
          budgetId: params.id,
          userId: session.user.id,
          accion: "UPDATE",
          detalles: changes.join(" | "),
        },
      });
    }

    return NextResponse.json(updatedBudget);
  } catch (error) {
    console.error("Error updating budget:", error);
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scope = (searchParams.get("scope") || "app") as "app" | "contasimple" | "both";

    const budget = await prisma.budget.findUnique({
      where: { id: params.id },
    });

    if (!budget) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Delete in Contasimple if requested.
    if (scope === "contasimple" || scope === "both") {
      if (!budget.contasimpleId) {
        return NextResponse.json(
          { error: "Este presupuesto no está vinculado a Contasimple, no se puede eliminar allí." },
          { status: 422 }
        );
      }
      try {
        const company = await resolveCompanyForEstimate(budget.contasimpleId, budget.contasimpleCompany);
        if (!company) throw new Error("No se encontró el presupuesto en Contasimple");
        await deleteEstimate(company, budget.contasimpleId);
      } catch (e) {
        console.error("Error eliminando presupuesto en Contasimple:", e);
        return NextResponse.json(
          { error: `No se pudo eliminar en Contasimple: ${contasimpleErrorMessage(e)}` },
          { status: 422 }
        );
      }
    }

    if (scope === "both" || scope === "app") {
      // Delete budget (cascade deletes related notes, files, audit logs)
      await prisma.budget.delete({
        where: { id: params.id },
      });
    } else if (scope === "contasimple") {
      // Deleted only in Contasimple: keep local record but clear stale links.
      await prisma.budget.update({
        where: { id: params.id },
        data: { contasimpleId: null, contasimpleCompany: null, contasimpleNumber: null },
      });
    }

    return NextResponse.json({ success: true, scope });
  } catch (error) {
    console.error("Error deleting budget:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
