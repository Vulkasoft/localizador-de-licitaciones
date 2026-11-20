import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CompanyKey } from "@/lib/contasimple";
import { resolveCompanyForEstimate, syncEstimateToBudget } from "@/lib/contasimple-sync";

export const dynamic = "force-dynamic";

// POST: Pull the latest estimate data (lines, totals, PDF) from Contasimple
// into this budget. Used for the live-on-open refresh in the budget detail.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const budget = await prisma.budget.findUnique({ where: { id: params.id } });
    if (!budget) {
      return NextResponse.json({ error: "Presupuesto no encontrado" }, { status: 404 });
    }
    if (!budget.contasimpleId) {
      return NextResponse.json({ synced: false, reason: "not_contasimple" });
    }

    let company = (budget.contasimpleCompany as CompanyKey | null) || null;
    if (company !== "peninsula" && company !== "canarias") {
      company = await resolveCompanyForEstimate(budget.contasimpleId, budget.contasimpleCompany);
    }
    if (!company) {
      return NextResponse.json({ synced: false, reason: "sede_not_found" });
    }

    const res = await syncEstimateToBudget(company, budget.contasimpleId, {
      userId: budget.userId,
      importPdf: true,
    });

    return NextResponse.json({ synced: true, ...res });
  } catch (error) {
    console.error("Error syncing budget from Contasimple:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al sincronizar con Contasimple" },
      { status: 500 }
    );
  }
}
