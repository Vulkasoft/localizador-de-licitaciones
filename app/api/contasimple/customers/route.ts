import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fetchCustomers, searchCustomers, CompanyKey } from "@/lib/contasimple";
import { upsertCustomerFromContasimple } from "@/lib/contasimple-sync";

export const dynamic = "force-dynamic";

function getCompanyParam(request: Request): CompanyKey {
  const { searchParams } = new URL(request.url);
  const c = searchParams.get("company");
  return c === "peninsula" ? "peninsula" : "canarias";
}

// GET: Preview customers from Contasimple
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const company = getCompanyParam(request);
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("query") || "").trim();

    if (query) {
      const customers = await searchCustomers(company, query);
      return NextResponse.json({
        customers,
        total: customers.length,
        page: 1,
        pageSize: customers.length,
        company,
        query,
      });
    }

    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "50");

    const result = await fetchCustomers(company, page, pageSize);

    return NextResponse.json({
      customers: result.data,
      total: result.totalCount,
      page,
      pageSize,
      company,
    });
  } catch (error) {
    console.error("Error fetching Contasimple customers:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al obtener clientes de Contasimple" },
      { status: 500 }
    );
  }
}

// POST: Import customers from Contasimple into local DB
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { customerIds, company: companyParam } = body as { customerIds?: number[]; company?: string };
    const company: CompanyKey = companyParam === "peninsula" ? "peninsula" : "canarias";

    // Fetch from Contasimple
    let page = 1;
    const pageSize = 300;
    const allCustomers = [];

    while (true) {
      const result = await fetchCustomers(company, page, pageSize);
      allCustomers.push(...result.data);
      // Contasimple's totalCount is unreliable for some endpoints (returns page
      // count, not the real total) — stop only when the last (short) page arrives.
      if (result.data.length < pageSize) break;
      page++;
      if (page > 500) break; // hard safety cap
    }

    // Filter if specific IDs provided
    const toImport = customerIds && customerIds.length > 0
      ? allCustomers.filter(c => customerIds.includes(c.id))
      : allCustomers;

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const customer of toImport) {
      try {
        const r = await upsertCustomerFromContasimple(company, customer);
        if (r === "created") imported++;
        else updated++;
      } catch (err) {
        console.error(`Error importing customer ${customer.id}:`, err);
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      updated,
      skipped,
      total: toImport.length,
      company,
    });
  } catch (error) {
    console.error("Error importing customers:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al importar clientes" },
      { status: 500 }
    );
  }
}
