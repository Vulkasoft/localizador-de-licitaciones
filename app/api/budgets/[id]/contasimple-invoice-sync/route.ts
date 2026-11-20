import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { syncInvoiceStatusForBudget } from "@/lib/contasimple-sync";

export const dynamic = "force-dynamic";

// POST: Reflect the real issued invoice(s) linked to this budget's estimate
// in Contasimple (both sedes) onto the budget billing fields. Read-only pull:
// it never creates or deletes invoices in Contasimple.
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const result = await syncInvoiceStatusForBudget(params.id);

    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Presupuesto no encontrado" }, { status: 404 });
    }
    if (result.reason === "not_contasimple") {
      return NextResponse.json(
        { error: "Este presupuesto no está vinculado a Contasimple", ...result },
        { status: 422 }
      );
    }

    if (result.synced) {
      try {
        await prisma.auditLog.create({
          data: {
            budgetId: params.id,
            userId: session.user.id,
            accion: "CONTASIMPLE_INVOICE_SYNC",
            detalles: `Facturas encontradas: ${result.invoices}. Facturado: ${result.facturado ? "sí" : "no"}${result.numeroFactura ? ` (${result.numeroFactura})` : ""}.`,
          },
        });
      } catch { /* audit is best-effort */ }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error syncing invoice status from Contasimple:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al sincronizar la facturación con Contasimple" },
      { status: 500 }
    );
  }
}
