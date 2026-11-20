import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createEstimateWithLocalBudget, EstimateCreationError } from "@/lib/estimate-creation";

export const dynamic = "force-dynamic";

// POST: Create a REAL estimate in Contasimple + mirror it as a local Budget
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const company = body?.company === "peninsula" ? "peninsula" : "canarias";

    const result = await createEstimateWithLocalBudget(
      {
        company,
        targetEntityId: body?.targetEntityId ?? null,
        clienteNombre: body?.clienteNombre ?? null,
        lines: Array.isArray(body?.lines) ? body.lines : [],
        notes: body?.notes ?? null,
        expirationDate: body?.expirationDate ?? null,
        nombre: body?.nombre ?? null,
        comunidadAutonoma: body?.comunidadAutonoma ?? null,
        ciudad: body?.ciudad ?? null,
        descripcion: body?.descripcion ?? null,
        fechaPlazo: body?.fechaPlazo ?? null,
        tenderId: body?.tenderId ?? null,
      },
      session.user.id,
      session.user.email || "usuario"
    );

    return NextResponse.json({
      success: true,
      contasimpleId: result.estimate?.id ?? null,
      contasimpleNumber: result.estimate?.number ?? null,
      localBudgetId: result.localBudgetId,
      matchedCustomer: result.matchedCustomer,
      aviso: "Presupuesto creado en estado 'Creado' en Contasimple. Pendiente de valoración humana de precios.",
    });
  } catch (error) {
    console.error("Error creating Contasimple estimate:", error);
    if (error instanceof EstimateCreationError) {
      return NextResponse.json(
        { error: error.message, candidates: error.candidates ?? undefined },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al crear el presupuesto en Contasimple" },
      { status: 500 }
    );
  }
}
