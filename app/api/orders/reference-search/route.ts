import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CompanyKey, fetchIssuedInvoices } from "@/lib/contasimple";

export const dynamic = "force-dynamic";

export const maxDuration = 60;

// Estimates remain local. Invoices must come from Contasimple, independently
// of whether a local estimate has its numeroFactura populated.
async function searchInvoices(query: string) {
  const currentYear = new Date().getUTCFullYear();
  const explicitYear = query.match(/(?:^|[^0-9])(20[0-9]{2})(?=[^0-9]|$)/)?.[1];
  const years = explicitYear ? [Number(explicitYear)] : [currentYear, currentYear - 1];
  const tasks = years.flatMap(year => [1, 2, 3, 4].flatMap(quarter =>
    (["peninsula", "canarias"] as CompanyKey[]).map(company => ({ company, period: `${year}-${quarter}T` }))
  ));
  const results: { id: string; budgetId: string; tipo: "FACTURA"; numero: string;
    contasimpleNumber: string | null; numeroFactura: string; facturado: boolean;
    sede: CompanyKey; cliente: string; totalConIva: number; estado: string }[] = [];
  const errors: string[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, async () => {
    while (next < tasks.length) {
      const { company, period } = tasks[next++];
      try {
        const invoices = await fetchIssuedInvoices(company, period);
        for (const invoice of invoices) {
          if (!(invoice.number || "").toLowerCase().includes(query.toLowerCase())) continue;
          results.push({ id: `${company}:${invoice.id}`, budgetId: "", tipo: "FACTURA",
            numero: invoice.number, contasimpleNumber: null, numeroFactura: invoice.number,
            facturado: true, sede: company, cliente: invoice.entityString,
            totalConIva: invoice.totalAmount, estado: invoice.status });
        }
      } catch (error) {
        console.error("Error buscando referencia de factura", { company, period, message: error instanceof Error ? error.message : "Error desconocido" });
        errors.push(`${company === "canarias" ? "Canarias" : "Península"} ${period}`);
      }
    }
  }));
  // Link only by an explicitly recorded invoice number AND company, never by
  // guessing from client/amount. Standalone invoices keep an empty budgetId.
  if (results.length) {
    const budgets = await prisma.budget.findMany({
      where: { numeroFactura: { in: results.map(r => r.numero) } },
      select: { id: true, numeroFactura: true, contasimpleNumber: true, contasimpleCompany: true },
    });
    for (const result of results) {
      const matches = budgets.filter(b => b.numeroFactura === result.numero && b.contasimpleCompany === result.sede);
      if (matches.length === 1) {
        result.budgetId = matches[0].id;
        result.contasimpleNumber = matches[0].contasimpleNumber;
      }
    }
  }
  const unique = Array.from(new Map(results.map(r => [r.id, r])).values());
  unique.sort((a, b) => Number(b.numero.toLowerCase() === query.toLowerCase()) - Number(a.numero.toLowerCase() === query.toLowerCase()) || b.numero.localeCompare(a.numero));
  return { results: unique.slice(0, 20), warnings: errors.length ? [`Consulta incompleta. No se pudieron consultar: ${errors.join(", ")}. Vuelve a buscar.`] : [], failed: errors.length === tasks.length };
}

// tipo: "PRESUPUESTO" | "FACTURA" | "ALL" (default ALL)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("query") || "").trim();
    const tipo = (searchParams.get("tipo") || "ALL").toUpperCase();
    if (!query) {
      return NextResponse.json({ results: [] });
    }

    const invoices = tipo !== "PRESUPUESTO" ? await searchInvoices(query) : null;
    if (tipo === "FACTURA") {
      if (invoices?.failed) return NextResponse.json({ error: "No se pudieron consultar las facturas de Contasimple. Vuelve a intentarlo." }, { status: 502 });
      return NextResponse.json({ results: invoices?.results ?? [], warnings: invoices?.warnings ?? [] });
    }

    const presupuestoCond = {
      contasimpleNumber: { contains: query, mode: "insensitive" as const },
    };
    const facturaCond = {
      numeroFactura: { contains: query, mode: "insensitive" as const },
    };

    let where: any;
    if (tipo === "PRESUPUESTO") where = presupuestoCond;
    else if (tipo === "FACTURA") where = facturaCond;
    else where = { OR: [presupuestoCond, facturaCond] };

    const budgets = await prisma.budget.findMany({
      where,
      select: {
        id: true,
        contasimpleNumber: true,
        numeroFactura: true,
        facturado: true,
        fechaFactura: true,
        contasimpleCompany: true,
        cliente: true,
        nombre: true,
        totalConIva: true,
        estado: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });

    const results = budgets.map((b) => {
      // Decide which number matched to label the result appropriately.
      const q = query.toLowerCase();
      const matchesFactura =
        !!b.numeroFactura && b.numeroFactura.toLowerCase().includes(q);
      const matchesPresupuesto =
        !!b.contasimpleNumber && b.contasimpleNumber.toLowerCase().includes(q);
      let matchTipo: "PRESUPUESTO" | "FACTURA" = "PRESUPUESTO";
      if (tipo === "FACTURA") matchTipo = "FACTURA";
      else if (tipo === "PRESUPUESTO") matchTipo = "PRESUPUESTO";
      else if (matchesFactura && !matchesPresupuesto) matchTipo = "FACTURA";
      const numero =
        matchTipo === "FACTURA"
          ? b.numeroFactura || b.contasimpleNumber
          : b.contasimpleNumber || b.numeroFactura;
      return {
        budgetId: b.id,
        tipo: matchTipo,
        numero,
        contasimpleNumber: b.contasimpleNumber,
        numeroFactura: b.numeroFactura,
        facturado: b.facturado,
        sede: b.contasimpleCompany,
        cliente: b.cliente || b.nombre,
        totalConIva: b.totalConIva,
        estado: b.estado,
      };
    });

    return NextResponse.json({ results: invoices ? [...invoices.results, ...results.filter(r => r.tipo === "PRESUPUESTO")] : results, warnings: invoices?.warnings ?? [] });
  } catch (error) {
    console.error("Error searching references:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
