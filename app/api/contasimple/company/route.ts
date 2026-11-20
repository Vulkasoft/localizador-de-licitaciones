import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCompanyInfo, CompanyKey } from "@/lib/contasimple";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const companyParam = searchParams.get("company");
    const company: CompanyKey = companyParam === "peninsula" ? "peninsula" : "canarias";

    try {
      const info = await getCompanyInfo(company);
      return NextResponse.json({ company, info, configured: true });
    } catch (error: any) {
      // Clave API aún no configurada: estado inicial esperado, no es un fallo.
      if (typeof error?.message === "string" && error.message.includes("no configurada")) {
        return NextResponse.json({ company, info: null, configured: false });
      }
      throw error;
    }
  } catch (error) {
    console.error("Error fetching company info:", error);
    return NextResponse.json({ error: "Error al conectar con Contasimple" }, { status: 500 });
  }
}
