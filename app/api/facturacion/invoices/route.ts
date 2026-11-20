import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CompanyKey, fetchIssuedInvoices, ContasimpleIssuedInvoice } from "@/lib/contasimple";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseDay(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const day = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value ? day : null;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const params = req.nextUrl.searchParams;
  const from = parseDay(params.get("desde"));
  const until = parseDay(params.get("hasta"));
  if (!from || !until || from > until) {
    return NextResponse.json({ error: "Indica un intervalo de fechas válido: Desde no puede ser posterior a Hasta." }, { status: 400 });
  }
  const currentYear = new Date().getUTCFullYear();
  if (from.getUTCFullYear() < 2020 || until.getUTCFullYear() > currentYear) {
    return NextResponse.json({ error: `Selecciona fechas desde 2020 hasta ${currentYear}.` }, { status: 400 });
  }
  const site = params.get("sede") || "all";
  if (!["all", "canarias", "peninsula"].includes(site)) {
    return NextResponse.json({ error: "Sede no válida" }, { status: 400 });
  }
  const companies: CompanyKey[] = site === "all" ? ["canarias", "peninsula"] : [site as CompanyKey];
  const tasks: { company: CompanyKey; period: string }[] = [];
  for (let year = from.getUTCFullYear(); year <= until.getUTCFullYear(); year++) {
    for (let quarter = 1; quarter <= 4; quarter++) {
      const start = Date.UTC(year, (quarter - 1) * 3, 1);
      const end = Date.UTC(year, quarter * 3, 1);
      if (start <= until.getTime() && end > from.getTime()) {
        for (const company of companies) tasks.push({ company, period: `${year}-${quarter}T` });
      }
    }
  }
  const rows = new Map<string, { company: CompanyKey; invoice: ContasimpleIssuedInvoice }>();
  const errors: string[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, async () => {
    while (next < tasks.length) {
      const { company, period } = tasks[next++];
      try {
        const invoices = await fetchIssuedInvoices(company, period);
        for (const invoice of invoices) {
          const date = new Date(invoice.invoiceDate).getTime();
          if (date >= from.getTime() && date < until.getTime() + 86400000) {
            rows.set(`${company}:${invoice.id}`, { company, invoice });
          }
        }
      } catch (error) {
        console.error("[facturacion/invoices] Error de lectura", { company, period, message: error instanceof Error ? error.message : "Error desconocido" });
        errors.push(`${company === "canarias" ? "Canarias" : "Península"} · ${period}`);
      }
    }
  }));
  if (errors.length === tasks.length && tasks.length) {
    return NextResponse.json({ error: "No se pudieron consultar las facturas en Contasimple. Inténtalo de nuevo.", errors }, { status: 502 });
  }
  const invoices = Array.from(rows.values()).map(({ company, invoice }) => ({
    id: `${company}:${invoice.id}`,
    company,
    numero: invoice.number,
    cliente: invoice.entityString,
    fecha: invoice.invoiceDate,
    total: invoice.totalAmount,
    estado: invoice.status,
    conceptos: (invoice.lines || []).map(line => line.concept || "").join(" · "),
  })).sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime() || a.id.localeCompare(b.id));
  return NextResponse.json({ invoices, errors, desde: params.get("desde"), hasta: params.get("hasta"), sede: site }, { headers: { "Cache-Control": "no-store" } });
}
