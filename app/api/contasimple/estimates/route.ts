import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchAllEstimates, CompanyKey } from "@/lib/contasimple";
import { syncEstimateToBudget } from "@/lib/contasimple-sync";

export const dynamic = "force-dynamic";

function getCompanyParam(request: Request): CompanyKey {
  const { searchParams } = new URL(request.url);
  const c = searchParams.get("company");
  return c === "peninsula" ? "peninsula" : "canarias";
}

// GET: Preview estimates from Contasimple
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const company = getCompanyParam(request);
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.max(1, parseInt(searchParams.get("pageSize") || "50"));
    const query = (searchParams.get("query") || "").trim().toLowerCase();

    // Contasimple's estimates endpoint returns an unreliable totalCount (it echoes
    // the page size, not the real total), so we fetch the full list to compute the
    // true total and paginate server-side. The list is small (a few hundred rows).
    const all = await fetchAllEstimates(company);

    // Server-side search across ALL estimates (not just the current page) so the
    // search box filters the whole dataset, not the loaded page.
    if (query) {
      const matches = all.filter(
        (e) =>
          (e.number || "").toLowerCase().includes(query) ||
          (e.entityString || "").toLowerCase().includes(query)
      );
      return NextResponse.json({
        estimates: matches,
        total: matches.length,
        page: 1,
        pageSize: matches.length,
        company,
        query,
      });
    }

    const start = (page - 1) * pageSize;
    const pageData = all.slice(start, start + pageSize);

    return NextResponse.json({
      estimates: pageData,
      total: all.length,
      page,
      pageSize,
      company,
    });
  } catch (error) {
    console.error("Error fetching Contasimple estimates:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al obtener presupuestos de Contasimple" },
      { status: 500 }
    );
  }
}

// POST: Import estimates from Contasimple as Budgets
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { estimateIds, company: companyParam } = body as { estimateIds?: number[]; company?: string };
    const company: CompanyKey = companyParam === "peninsula" ? "peninsula" : "canarias";

    // Fetch every estimate from Contasimple (fetchAllEstimates paginates internally
    // and does NOT rely on the unreliable totalCount field).
    const allEstimates = await fetchAllEstimates(company);

    // Filter if specific IDs provided
    const toImport = estimateIds && estimateIds.length > 0
      ? allEstimates.filter(e => estimateIds.includes(e.id))
      : allEstimates;

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const estimate of toImport) {
      try {
        // Populate structured lines + totals + sede. Skip PDF here to keep the
        // bulk import fast; the PDF is imported lazily when a budget is viewed.
        const res = await syncEstimateToBudget(company, estimate.id, {
          userId: session.user.id,
          estimate,
          importPdf: false,
        });
        if (res.created) imported++;
        else updated++;
      } catch (err) {
        console.error(`Error importing estimate ${estimate.id}:`, err);
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
    console.error("Error importing estimates:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al importar presupuestos" },
      { status: 500 }
    );
  }
}
