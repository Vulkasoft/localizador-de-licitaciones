import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { createCustomer, updateCustomer, deleteCustomer, CompanyKey, CustomerWriteInput } from "@/lib/contasimple";
import { validateSpanishNif } from "@/lib/nif";
import { contasimpleErrorMessage } from "@/lib/contasimple-error";

export const dynamic = "force-dynamic";

// GET: customer detail + aggregated budgets / tenders / notes
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: params.id },
    });
    if (!customer) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    const [budgets, tenders, notes] = await Promise.all([
      prisma.budget.findMany({
        where: { customerId: params.id },
        orderBy: { createdAt: "desc" },
        include: { files: true },
      }),
      prisma.tender.findMany({
        where: { customerId: params.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.note.findMany({
        where: { customerId: params.id },
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true } } },
      }),
    ]);

    // Budget totals by estado
    const totals = {
      budgets: budgets.length,
      tenders: tenders.length,
      notes: notes.length,
      notesPendientes: notes.filter((n) => n.estado === "PENDING").length,
    };

    return NextResponse.json({ customer, budgets, tenders, notes, totals });
  } catch (error) {
    console.error("Error fetching customer detail:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

const updateSchema = z.object({
  nombre: z.string().min(1).optional(),
  nif: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  telefono: z.string().optional().nullable(),
  movil: z.string().optional().nullable(),
  direccion: z.string().optional().nullable(),
  ciudad: z.string().optional().nullable(),
  provincia: z.string().optional().nullable(),
  codigoPostal: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
  etiqueta: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  // When true, also push the changes to Contasimple (update existing sede
  // records, or create them if the customer was only stored locally).
  syncToContasimple: z.boolean().optional(),
});

// PUT: update customer info / tags
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { syncToContasimple, ...data } = updateSchema.parse(body);

    const existing = await prisma.customer.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    // A pure tag/color edit (etiqueta/color only) never touches Contasimple.
    const editsCoreFields = ["nombre", "nif", "email", "telefono", "movil", "direccion", "ciudad", "provincia", "codigoPostal", "notas"]
      .some((k) => k in data);
    const willSync = syncToContasimple === true && editsCoreFields;

    const csIds: { contasimpleIdPeninsula?: number; contasimpleIdCanarias?: number } = {};
    const csErrors: string[] = [];
    let csErrorDetail = "";

    if (willSync) {
      const merged = { ...existing, ...data };
      const check = validateSpanishNif(merged.nif);
      if (!check.valid) {
        return NextResponse.json(
          { error: check.message || "El NIF/CIF no es válido para Contasimple.", field: "nif" },
          { status: 422 }
        );
      }
      const payload: CustomerWriteInput = {
        organization: merged.nombre,
        nif: merged.nif ?? null,
        address: merged.direccion ?? null,
        province: merged.provincia ?? null,
        city: merged.ciudad ?? null,
        postalCode: merged.codigoPostal ?? null,
        phone: merged.telefono ?? null,
        mobile: merged.movil ?? null,
        email: merged.email ?? null,
        notes: merged.notas ?? null,
      };
      const sedes: { key: CompanyKey; field: "contasimpleIdPeninsula" | "contasimpleIdCanarias"; id: number | null; label: string }[] = [
        { key: "peninsula", field: "contasimpleIdPeninsula", id: existing.contasimpleIdPeninsula, label: "Península" },
        { key: "canarias", field: "contasimpleIdCanarias", id: existing.contasimpleIdCanarias, label: "Canarias" },
      ];
      for (const s of sedes) {
        try {
          if (s.id) {
            await updateCustomer(s.key, s.id, payload);
          } else {
            const created = await createCustomer(s.key, payload);
            if (created?.id) csIds[s.field] = created.id;
          }
        } catch (e) {
          console.error(`Error actualizando cliente en Contasimple (${s.label}):`, e);
          csErrors.push(s.label);
          if (!csErrorDetail) csErrorDetail = contasimpleErrorMessage(e);
        }
      }

      // If NOTHING could be created/updated in Contasimple (invalid data), abort.
      if (csErrors.length === sedes.length) {
        return NextResponse.json(
          { error: `No se pudo guardar en Contasimple: ${csErrorDetail}`, field: "nif", contasimpleErrors: csErrors },
          { status: 422 }
        );
      }
    }

    const customer = await prisma.customer.update({
      where: { id: params.id },
      data: { ...data, ...csIds },
    });
    return NextResponse.json({ customer, contasimpleErrors: csErrors.length ? csErrors : undefined });
  } catch (error) {
    console.error("Error updating customer:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validación fallida", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// DELETE: remove a customer, choosing WHERE via ?scope=app|contasimple|both.
//  - app         → delete only in this application (never touches Contasimple)
//  - contasimple → delete only in Contasimple (both sedes); keep local record
//                  but clear the now-stale Contasimple links
//  - both        → delete in Contasimple and in this application
// Linked budgets/tenders keep their history but are unlinked (SetNull); notes
// cascade-delete with the customer.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const scope = (searchParams.get("scope") || "app") as "app" | "contasimple" | "both";

    const existing = await prisma.customer.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    const csErrors: string[] = [];
    let csErrorDetail = "";
    let csDeleted = false;

    if (scope === "contasimple" || scope === "both") {
      const sedes: { key: CompanyKey; id: number | null; label: string }[] = [
        { key: "peninsula", id: existing.contasimpleIdPeninsula, label: "Península" },
        { key: "canarias", id: existing.contasimpleIdCanarias, label: "Canarias" },
      ];
      for (const s of sedes) {
        if (!s.id) continue;
        try {
          await deleteCustomer(s.key, s.id);
          csDeleted = true;
        } catch (e) {
          console.error(`Error eliminando cliente en Contasimple (${s.label}):`, e);
          csErrors.push(s.label);
          if (!csErrorDetail) csErrorDetail = contasimpleErrorMessage(e);
        }
      }
      const hadCsIds = !!(existing.contasimpleIdPeninsula || existing.contasimpleIdCanarias);
      if (!hadCsIds) {
        return NextResponse.json(
          { error: "Este cliente no está vinculado a Contasimple, no se puede eliminar allí." },
          { status: 422 }
        );
      }
      // If Contasimple deletion was requested but every attempt failed, abort
      // so we don't remove the local record while it still exists in Contasimple.
      if (csErrors.length > 0 && !csDeleted) {
        return NextResponse.json(
          { error: `No se pudo eliminar en Contasimple: ${csErrorDetail}`, contasimpleErrors: csErrors },
          { status: 422 }
        );
      }
    }

    if (scope === "both" || scope === "app") {
      await prisma.customer.delete({ where: { id: params.id } });
    } else if (scope === "contasimple") {
      await prisma.customer.update({
        where: { id: params.id },
        data: { contasimpleId: null, contasimpleIdPeninsula: null, contasimpleIdCanarias: null },
      });
    }

    return NextResponse.json({ success: true, scope, contasimpleErrors: csErrors.length ? csErrors : undefined });
  } catch (error) {
    console.error("Error deleting customer:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
