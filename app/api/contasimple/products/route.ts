import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchProducts, listProducts, CompanyKey } from "@/lib/contasimple";

export const dynamic = "force-dynamic";

function getCompanyParam(request: Request): CompanyKey {
  const { searchParams } = new URL(request.url);
  const c = searchParams.get("company");
  return c === "peninsula" ? "peninsula" : "canarias";
}

// GET: Search products in the Contasimple catalog
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
      const products = await searchProducts(company, query);
      return NextResponse.json({ products, total: products.length, company, query });
    }

    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "50");
    const result = await listProducts(company, page, pageSize);
    return NextResponse.json({
      products: result.data,
      total: result.totalCount,
      page,
      pageSize,
      company,
    });
  } catch (error) {
    console.error("Error fetching Contasimple products:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al buscar productos en Contasimple" },
      { status: 500 }
    );
  }
}
