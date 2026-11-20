import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import {
  CompanyKey,
  EstimateLineInput,
  getEstimateDetail,
  updateEstimate,
} from "@/lib/contasimple";
import { resolveCompanyForEstimate, syncEstimateToBudget } from "@/lib/contasimple-sync";

export const dynamic = "force-dynamic";

const lineSchema = z.object({
  concept: z.string().min(1, "El concepto es obligatorio"),
  quantity: z.number().finite(),
  unitAmount: z.number().finite(),
  vatPercentage: z.number().finite(),
  discountPercentage: z.number().finite().optional().nullable(),
  detailedDescription: z.string().optional().nullable(),
  productId: z.number().int().optional().nullable(),
  productName: z.string().optional().nullable(),
  productSku: z.string().optional().nullable(),
});

const bodySchema = z.object({
  lines: z.array(lineSchema).min(1, "Debe haber al menos una línea"),
  notes: z.string().optional().nullable(),
});

// PUT: Edit the estimate lines on the fly and push the changes to Contasimple,
// then re-sync the local budget (structured lines, totals, PDF).
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Datos inválidos" },
        { status: 400 }
      );
    }

    const budget = await prisma.budget.findUnique({ where: { id: params.id } });
    if (!budget) {
      return NextResponse.json({ error: "Presupuesto no encontrado" }, { status: 404 });
    }
    if (!budget.contasimpleId) {
      return NextResponse.json(
        { error: "Este presupuesto no está vinculado a Contasimple" },
        { status: 400 }
      );
    }

    let company = (budget.contasimpleCompany as CompanyKey | null) || null;
    if (company !== "peninsula" && company !== "canarias") {
      company = await resolveCompanyForEstimate(budget.contasimpleId, budget.contasimpleCompany);
    }
    if (!company) {
      return NextResponse.json({ error: "No se pudo determinar la sede del presupuesto" }, { status: 400 });
    }

    // Read current estimate to obtain target, number and numbering format.
    const detail = await getEstimateDetail(company, budget.contasimpleId);
    const targetEntityId = detail.target?.id;
    if (!targetEntityId) {
      return NextResponse.json({ error: "El presupuesto de Contasimple no tiene cliente asociado" }, { status: 400 });
    }

    const lines: EstimateLineInput[] = parsed.data.lines.map((l) => ({
      concept: l.concept,
      quantity: l.quantity,
      unitAmount: l.unitAmount,
      vatPercentage: l.vatPercentage,
      discountPercentage: l.discountPercentage ?? undefined,
      detailedDescription: l.detailedDescription ?? undefined,
      productId: l.productId ?? undefined,
      productName: l.productName ?? undefined,
      productSku: l.productSku ?? undefined,
    }));

    await updateEstimate(company, budget.contasimpleId, {
      targetEntityId,
      numberingFormatId: detail.numberingFormatId,
      number: detail.number,
      status: detail.status,
      date: detail.presupuestoDate || detail.issueDate,
      expirationDate: detail.expirationDate,
      notes: parsed.data.notes ?? detail.notes,
      lines,
    });

    // Re-sync local budget with the updated estimate + fresh PDF.
    const res = await syncEstimateToBudget(company, budget.contasimpleId, {
      userId: budget.userId,
      importPdf: true,
    });

    await prisma.auditLog.create({
      data: {
        budgetId: budget.id,
        userId: session.user.id,
        accion: "UPDATE",
        detalles: `Líneas del presupuesto editadas y enviadas a Contasimple (${company === "canarias" ? "Canarias" : "Península"}): ${lines.length} líneas`,
      },
    });

    return NextResponse.json({ success: true, ...res });
  } catch (error) {
    console.error("Error updating estimate lines:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al actualizar el presupuesto en Contasimple" },
      { status: 500 }
    );
  }
}
