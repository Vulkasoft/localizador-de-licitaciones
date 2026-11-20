import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CompanyKey } from "@/lib/contasimple";
import { syncAllCustomers, syncAllEstimates } from "@/lib/contasimple-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function authorize(request: Request): Promise<boolean> {
  const auth = request.headers.get("authorization") || "";
  const secret = process.env.ALARM_CRON_SECRET;
  if (secret && auth === `Bearer ${secret}`) return true;
  const session = await getServerSession(authOptions);
  return !!session?.user?.id;
}

// POST: Background synchronization of Contasimple customers + estimates for both
// sedes into the local DB. Triggered by the scheduled task (Bearer secret) or an
// authenticated user. Does NOT send any emails/notifications.
export async function POST(request: Request) {
  try {
    if (!(await authorize(request))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope"); // "customers" | "estimates" | null(both)
    const sedes: CompanyKey[] = ["peninsula", "canarias"];

    const result: Record<string, unknown> = { customers: {}, estimates: {} };
    const errors: string[] = [];

    // Run each sede/scope independently: a transient failure from Contasimple's
    // external API (e.g. an intermittent 500 HTML error page) for one sede must
    // not abort the whole sync. We collect per-sede errors and still report the
    // parts that succeeded.
    if (scope !== "estimates") {
      for (const c of sedes) {
        try {
          (result.customers as any)[c] = await syncAllCustomers(c);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          (result.customers as any)[c] = { error: msg };
          errors.push(`customers/${c}: ${msg}`);
          console.error(`Contasimple cron sync failed for customers/${c}:`, msg);
        }
      }
    }
    if (scope !== "customers") {
      for (const c of sedes) {
        try {
          (result.estimates as any)[c] = await syncAllEstimates(c);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          (result.estimates as any)[c] = { error: msg };
          errors.push(`estimates/${c}: ${msg}`);
          console.error(`Contasimple cron sync failed for estimates/${c}:`, msg);
        }
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      partial: errors.length > 0,
      errors,
      syncedAt: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error("Error in Contasimple cron sync:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error en la sincronización" },
      { status: 500 }
    );
  }
}
