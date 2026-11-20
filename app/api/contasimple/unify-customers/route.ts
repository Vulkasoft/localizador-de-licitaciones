import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fetchAllCustomers } from "@/lib/contasimple";

export const dynamic = "force-dynamic";

function normalizeNif(nif?: string | null): string {
  return (nif || "").toUpperCase().replace(/[\s-]/g, "").trim();
}

async function authorize(request: Request): Promise<boolean> {
  const auth = request.headers.get("authorization") || "";
  const secret = process.env.ALARM_CRON_SECRET;
  if (secret && auth === `Bearer ${secret}`) return true;
  const session = await getServerSession(authOptions);
  return !!session?.user?.id;
}

// POST: One-time (idempotent) unification of duplicate local customers by NIF.
// Unifies locally only — never deletes anything in Contasimple. Also backfills
// the per-sede Contasimple ids (contasimpleIdPeninsula / contasimpleIdCanarias)
// from the live Contasimple customer lists so future imports match by sede.
// Body: { commit?: boolean } — defaults to a dry run (commit=false).
export async function POST(request: Request) {
  try {
    if (!(await authorize(request))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const commit = body?.commit === true;

    // Build NIF -> { peninsulaId, canariasId } from the live Contasimple lists.
    const [peninsula, canarias] = await Promise.all([
      fetchAllCustomers("peninsula"),
      fetchAllCustomers("canarias"),
    ]);
    const nifMap = new Map<string, { peninsulaId?: number; canariasId?: number }>();
    for (const c of peninsula) {
      const n = normalizeNif(c.nif);
      if (!n) continue;
      const e = nifMap.get(n) || {};
      if (e.peninsulaId == null) e.peninsulaId = c.id;
      nifMap.set(n, e);
    }
    for (const c of canarias) {
      const n = normalizeNif(c.nif);
      if (!n) continue;
      const e = nifMap.get(n) || {};
      if (e.canariasId == null) e.canariasId = c.id;
      nifMap.set(n, e);
    }

    // Load local customers.
    const locals = await prisma.customer.findMany({
      select: {
        id: true, nif: true, nombre: true, email: true, telefono: true, movil: true,
        direccion: true, provincia: true, ciudad: true, codigoPostal: true, pais: true,
        notas: true, url: true, etiqueta: true, color: true,
        contasimpleId: true, contasimpleIdPeninsula: true, contasimpleIdCanarias: true,
        createdAt: true,
        _count: { select: { budgets: true, tenders: true, notes: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    // Group by normalized NIF (skip rows without NIF — cannot unify safely).
    const groups = new Map<string, typeof locals>();
    for (const c of locals) {
      const n = normalizeNif(c.nif);
      if (!n) continue;
      const arr = groups.get(n) || [];
      arr.push(c);
      groups.set(n, arr);
    }

    const score = (c: (typeof locals)[number]) =>
      [c.email, c.telefono, c.movil, c.direccion, c.provincia, c.ciudad, c.codigoPostal, c.notas]
        .filter((v) => v && String(v).trim()).length;

    let groupsWithDuplicates = 0;
    let rowsDeleted = 0;
    let budgetsRepointed = 0;
    let tendersRepointed = 0;
    let notesRepointed = 0;
    let sedeIdsBackfilled = 0;
    const sampleActions: string[] = [];

    for (const [nif, rows] of Array.from(groups.entries())) {
      const mapped = nifMap.get(nif);
      // Choose survivor: most complete data, then oldest.
      const sorted = [...rows].sort((a, b) => {
        const s = score(b) - score(a);
        if (s !== 0) return s;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
      const survivor = sorted[0];
      const dups = sorted.slice(1);

      const survivorData: Record<string, unknown> = {};
      if (mapped?.peninsulaId != null && survivor.contasimpleIdPeninsula !== mapped.peninsulaId) {
        survivorData.contasimpleIdPeninsula = mapped.peninsulaId;
      }
      if (mapped?.canariasId != null && survivor.contasimpleIdCanarias !== mapped.canariasId) {
        survivorData.contasimpleIdCanarias = mapped.canariasId;
      }
      // Backfill missing scalar fields on survivor from duplicates.
      const fillable = ["email", "telefono", "movil", "direccion", "provincia", "ciudad", "codigoPostal", "pais", "notas", "url", "etiqueta", "color"] as const;
      for (const f of fillable) {
        if (!survivor[f]) {
          const donor = dups.find((d) => d[f]);
          if (donor) survivorData[f] = donor[f];
        }
      }

      if (dups.length > 0) groupsWithDuplicates++;

      if (dups.length > 0 && sampleActions.length < 12) {
        sampleActions.push(`${survivor.nombre} (NIF ${nif}): fusiona ${dups.length} duplicado(s)`);
      }

      if (!commit) {
        // Dry run: just count would-be repoints.
        for (const d of dups) {
          budgetsRepointed += d._count.budgets;
          tendersRepointed += d._count.tenders;
          notesRepointed += d._count.notes;
          rowsDeleted++;
        }
        if (Object.keys(survivorData).length) sedeIdsBackfilled++;
        continue;
      }

      // COMMIT: repoint FKs then delete duplicates, all in one transaction.
      await prisma.$transaction(async (tx) => {
        if (Object.keys(survivorData).length) {
          await tx.customer.update({ where: { id: survivor.id }, data: survivorData });
          sedeIdsBackfilled++;
        }
        for (const d of dups) {
          const b = await tx.budget.updateMany({ where: { customerId: d.id }, data: { customerId: survivor.id } });
          const t = await tx.tender.updateMany({ where: { customerId: d.id }, data: { customerId: survivor.id } });
          const n = await tx.note.updateMany({ where: { customerId: d.id }, data: { customerId: survivor.id } });
          budgetsRepointed += b.count;
          tendersRepointed += t.count;
          notesRepointed += n.count;
          await tx.customer.delete({ where: { id: d.id } });
          rowsDeleted++;
        }
      });
    }

    return NextResponse.json({
      success: true,
      commit,
      totals: {
        localCustomers: locals.length,
        nifGroups: groups.size,
        groupsWithDuplicates,
        rowsDeleted,
        budgetsRepointed,
        tendersRepointed,
        notesRepointed,
        sedeIdsBackfilled,
      },
      sampleActions,
    });
  } catch (error) {
    console.error("Error unifying customers:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al unificar clientes" },
      { status: 500 }
    );
  }
}
