import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { createCustomer, CompanyKey, CustomerWriteInput } from "@/lib/contasimple";
import { validateSpanishNif } from "@/lib/nif";
import { contasimpleErrorMessage } from "@/lib/contasimple-error";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const withCounts = searchParams.get("withCounts") === "true";
  const etiqueta = searchParams.get("etiqueta") || "";
  const distinctTags = searchParams.get("distinctTags") === "true";

  try {
    // Return the list of distinct etiquetas (labels) in use, for filter dropdowns.
    if (distinctTags) {
      const rows = await prisma.customer.findMany({
        where: { etiqueta: { not: null } },
        distinct: ["etiqueta"],
        select: { etiqueta: true },
        orderBy: { etiqueta: "asc" },
      });
      const tags = rows.map((r) => r.etiqueta).filter((t): t is string => !!t && t.trim() !== "");
      return NextResponse.json({ tags });
    }

    const where: any = {};
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: "insensitive" } },
        { nif: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }
    if (etiqueta) where.etiqueta = etiqueta;

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { nombre: "asc" },
      take: withCounts ? 500 : 50,
      select: {
        id: true,
        nombre: true,
        nif: true,
        email: true,
        telefono: true,
        movil: true,
        ciudad: true,
        provincia: true,
        direccion: true,
        etiqueta: true,
        color: true,
        ...(withCounts
          ? { _count: { select: { budgets: true, tenders: true, notes: true } } }
          : {}),
      },
    });

    return NextResponse.json(customers);
  } catch (error) {
    console.error("Error fetching customers:", error);
    return NextResponse.json(
      { error: "Error al obtener clientes" },
      { status: 500 }
    );
  }
}

const createSchema = z.object({
  nombre: z.string().min(1),
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
  // When true (default) the customer is also created in both Contasimple sedes.
  syncToContasimple: z.boolean().optional(),
});

// POST: create a customer manually (not from Contasimple)
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { syncToContasimple, ...data } = createSchema.parse(body);

    const willSync = syncToContasimple !== false;

    // When syncing to Contasimple, the NIF/CIF is mandatory and must be valid.
    // Reject BEFORE creating anything locally so we never end up with a local
    // customer that isn't associated with Contasimple.
    if (willSync) {
      const check = validateSpanishNif(data.nif);
      if (!check.valid) {
        return NextResponse.json(
          { error: check.message || "El NIF/CIF no es válido para Contasimple.", field: "nif" },
          { status: 422 }
        );
      }
    }

    // Create the customer directly in BOTH Contasimple sedes (Península + Canarias)
    // from within the app — no redirect to Contasimple.
    const csIds: { contasimpleIdPeninsula?: number; contasimpleIdCanarias?: number } = {};
    const csErrors: string[] = [];
    let csErrorDetail = "";
    if (willSync) {
      const payload: CustomerWriteInput = {
        organization: data.nombre,
        nif: data.nif ?? null,
        address: data.direccion ?? null,
        province: data.provincia ?? null,
        city: data.ciudad ?? null,
        postalCode: data.codigoPostal ?? null,
        phone: data.telefono ?? null,
        mobile: data.movil ?? null,
        email: data.email ?? null,
        notes: data.notas ?? null,
      };
      const sedes: { key: CompanyKey; field: "contasimpleIdPeninsula" | "contasimpleIdCanarias"; label: string }[] = [
        { key: "peninsula", field: "contasimpleIdPeninsula", label: "Península" },
        { key: "canarias", field: "contasimpleIdCanarias", label: "Canarias" },
      ];
      for (const s of sedes) {
        try {
          const created = await createCustomer(s.key, payload);
          if (created?.id) csIds[s.field] = created.id;
        } catch (e) {
          console.error(`Error creando cliente en Contasimple (${s.label}):`, e);
          csErrors.push(s.label);
          if (!csErrorDetail) csErrorDetail = contasimpleErrorMessage(e);
        }
      }

      // If it could NOT be created in ANY sede (typically an invalid NIF),
      // do not save it locally — force the user to fix the data first.
      if (csErrors.length === sedes.length) {
        return NextResponse.json(
          {
            error: `No se pudo crear el cliente en Contasimple: ${csErrorDetail}`,
            field: "nif",
            contasimpleErrors: csErrors,
          },
          { status: 422 }
        );
      }
    }

    const customer = await prisma.customer.create({
      data: { ...data, ...csIds },
    });
    return NextResponse.json(
      { customer, contasimpleErrors: csErrors.length ? csErrors : undefined },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating customer:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validación fallida", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
