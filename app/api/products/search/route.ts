import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  CompanyKey,
  fetchIssuedInvoices,
  ContasimpleIssuedInvoice,
} from "@/lib/contasimple";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COMPANIES: CompanyKey[] = ["canarias", "peninsula"];

function sedeLabel(company: string | null | undefined): "Canarias" | "Península" | null {
  if (company === "canarias") return "Canarias";
  if (company === "peninsula") return "Península";
  return null;
}

/** Sede from a Contasimple presupuesto number prefix (C- = Canarias, P- = Península). */
function sedeFromNumber(n?: string | null): "Canarias" | "Península" | null {
  if (!n) return null;
  const u = n.trim().toUpperCase();
  if (u.startsWith("C-")) return "Canarias";
  if (u.startsWith("P-")) return "Península";
  return null;
}

/** Collapse line-break residue for readable display of a concept. */
function cleanConcept(c: string): string {
  return (c || "").replace(/\r?\n/g, " ").replace(/\s{2,}/g, " ").trim();
}

function norm(s: string): string {
  return (s || "").toLowerCase();
}

interface LineLike {
  concept?: string | null;
  productName?: string | null;
  productSku?: string | null;
  detailedDescription?: string | null;
  quantity?: number | null;
}

function lineMatches(line: LineLike, q: string): boolean {
  const needle = norm(q);
  return (
    norm(line.concept || "").includes(needle) ||
    norm(line.productName || "").includes(needle) ||
    norm(line.productSku || "").includes(needle) ||
    norm(line.detailedDescription || "").includes(needle)
  );
}

/** Enumerate fiscal periods (YYYY-NT) for the given years. */
function periodsForYears(years: number[]): string[] {
  const out: string[] = [];
  for (const y of years) {
    for (let qr = 1; qr <= 4; qr++) out.push(`${y}-${qr}T`);
  }
  return out;
}

/** Run async tasks with limited concurrency. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const cur = idx++;
      results[cur] = await fn(items[cur]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return NextResponse.json({ error: "Introduce al menos 2 caracteres" }, { status: 400 });
  }

  const currentYear = new Date().getFullYear();
  let years: number[];
  const yearsParam = (searchParams.get("years") || "").trim();
  if (yearsParam) {
    years = yearsParam
      .split(",")
      .map((y) => parseInt(y.trim(), 10))
      .filter((y) => Number.isFinite(y) && y >= 2018 && y <= currentYear);
  } else {
    years = [currentYear, currentYear - 1];
  }
  if (years.length === 0) years = [currentYear];
  years = Array.from(new Set(years)).sort((a, b) => b - a);

  // ---- Presupuestos (local Budget table) ----
  let presupuestos: any[] = [];
  let presupuestosError: string | null = null;
  try {
    const budgets = await prisma.budget.findMany({
      where: { lineasJson: { contains: q, mode: "insensitive" } },
      select: {
        id: true,
        contasimpleNumber: true,
        contasimpleCompany: true,
        contasimpleEstado: true,
        cliente: true,
        nombre: true,
        totalConIva: true,
        estado: true,
        facturado: true,
        numeroFactura: true,
        fechaFactura: true,
        fechaSolicitud: true,
        lineasJson: true,
      },
      orderBy: { contasimpleNumber: "desc" },
      take: 500,
    });

    presupuestos = budgets
      .map((b) => {
        let matched: { concept: string; quantity: number | null }[] = [];
        try {
          const lines = JSON.parse(b.lineasJson || "[]") as LineLike[];
          matched = lines
            .filter((l) => lineMatches(l, q))
            .map((l) => ({ concept: cleanConcept(l.concept || ""), quantity: l.quantity ?? null }));
        } catch {
          matched = [];
        }
        return {
          id: b.id,
          numero: b.contasimpleNumber,
          sede: sedeLabel(b.contasimpleCompany) || sedeFromNumber(b.contasimpleNumber),
          cliente: b.cliente,
          nombre: b.nombre,
          total: b.totalConIva,
          estado: b.estado,
          estadoContasimple: b.contasimpleEstado,
          facturado: b.facturado,
          numeroFactura: b.numeroFactura,
          fechaFactura: b.fechaFactura,
          fecha: b.fechaSolicitud,
          lineas: matched,
        };
      })
      // keep only budgets that truly have a matching line (contains() can hit JSON noise)
      .filter((b) => b.lineas.length > 0);
  } catch (e: any) {
    presupuestosError = e?.message || "Error buscando presupuestos";
  }

  // ---- Facturas (Contasimple issued invoices) ----
  const periods = periodsForYears(years);
  const tasks: { company: CompanyKey; period: string }[] = [];
  for (const company of COMPANIES) for (const period of periods) tasks.push({ company, period });

  const facturasByKey = new Map<string, any>();
  const facturaErrors: Record<string, string> = {};

  await mapLimit(tasks, 4, async ({ company, period }) => {
    let invoices: ContasimpleIssuedInvoice[] = [];
    try {
      invoices = await fetchIssuedInvoices(company, period);
    } catch (e: any) {
      const key = sedeLabel(company) || company;
      // Only record a real error (ignore empty/unknown-period noise).
      facturaErrors[key] = e?.message?.slice(0, 160) || "Error";
      return;
    }
    for (const inv of invoices) {
      const matchedLines = (inv.lines || []).filter((l) => lineMatches(l, q));
      if (matchedLines.length === 0) continue;
      const key = `${company}:${inv.id}`;
      if (facturasByKey.has(key)) continue;
      facturasByKey.set(key, {
        id: inv.id,
        numero: inv.number,
        sede: sedeLabel(company),
        cliente: inv.entityString,
        fecha: inv.invoiceDate,
        periodo: inv.period,
        total: inv.totalAmount,
        estado: inv.status,
        lineas: matchedLines.map((l) => ({
          concept: cleanConcept(l.concept || ""),
          quantity: l.quantity ?? null,
        })),
      });
    }
  });

  const facturas = Array.from(facturasByKey.values()).sort((a, b) => {
    const da = a.fecha ? new Date(a.fecha).getTime() : 0;
    const db = b.fecha ? new Date(b.fecha).getTime() : 0;
    return db - da;
  });

  return NextResponse.json({
    query: q,
    years,
    presupuestos,
    facturas,
    presupuestosError,
    facturaErrors: Object.keys(facturaErrors).length ? facturaErrors : null,
    counts: {
      presupuestos: presupuestos.length,
      facturas: facturas.length,
    },
  });
}
