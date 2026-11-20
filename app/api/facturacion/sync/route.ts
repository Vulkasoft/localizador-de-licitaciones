import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { syncInvoiceStatusForBudget } from "@/lib/contasimple-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST: Bulk-reflect issued invoices from Contasimple onto several budgets.
// Body: { ids?: string[] }. When ids are given, only those budgets are synced
// (e.g. the rows currently visible). Otherwise, all budgets linked to
// Contasimple that are not yet marked as facturado are synced. Read-only pull.
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const ids: string[] | undefined = Array.isArray(body?.ids) ? body.ids : undefined;

    let targetIds: string[];
    if (ids && ids.length) {
      const rows = await prisma.budget.findMany({
        where: { id: { in: ids }, contasimpleId: { not: null } },
        select: { id: true },
      });
      targetIds = rows.map((r) => r.id);
    } else {
      const rows = await prisma.budget.findMany({
        where: { contasimpleId: { not: null }, facturado: false },
        select: { id: true },
        take: 300,
      });
      targetIds = rows.map((r) => r.id);
    }

    let updated = 0;
    let facturados = 0;
    let errores = 0;
    for (const id of targetIds) {
      try {
        const res = await syncInvoiceStatusForBudget(id);
        if (res.synced) {
          updated++;
          if (res.invoices > 0) facturados++;
        }
      } catch {
        errores++;
      }
    }

    return NextResponse.json({ revisados: targetIds.length, actualizados: updated, facturados, errores });
  } catch (error) {
    console.error("Error in bulk invoice sync:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al sincronizar la facturación" },
      { status: 500 }
    );
  }
}
