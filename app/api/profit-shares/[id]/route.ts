import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteFile } from "@/lib/s3-files";
import { splitProfit, parseMoney } from "@/lib/profit-utils";
import { z } from "zod";

export const dynamic = "force-dynamic";

const PROFIT_STATUSES = ["PENDIENTE", "PAGADO"] as const;

const budgetInclude = {
  select: {
    id: true,
    contasimpleNumber: true,
    numeroFactura: true,
    contasimpleCompany: true,
  },
} as const;

const updateSchema = z.object({
  concepto: z.string().optional().nullable(),
  referencia: z.string().optional().nullable(),
  referenciaTipo: z.string().optional().nullable(),
  budgetId: z.string().optional().nullable(),
  importeVenta: z.union([z.string(), z.number()]).optional().nullable(),
  beneficio: z.union([z.string(), z.number()]).optional().nullable(),
  estado: z.enum(PROFIT_STATUSES).optional(),
  fechaVenta: z.string().optional().nullable(),
  fechaPago: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profitShare = await prisma.profitShare.findUnique({
      where: { id: params.id },
      include: {
        files: { orderBy: { uploadedAt: "desc" } },
        budget: budgetInclude,
      },
    });

    if (!profitShare) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ profitShare });
  } catch (error) {
    console.error("Error fetching profit share:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await prisma.profitShare.findUnique({
      where: { id: params.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const data = updateSchema.parse(body);

    const updateData: any = {};
    if (data.concepto !== undefined) updateData.concepto = data.concepto || null;
    if (data.referencia !== undefined)
      updateData.referencia = data.referencia || null;
    if (data.referenciaTipo !== undefined)
      updateData.referenciaTipo = data.referenciaTipo || null;
    if (data.budgetId !== undefined) updateData.budgetId = data.budgetId || null;
    if (data.importeVenta !== undefined)
      updateData.importeVenta = parseMoney(data.importeVenta);
    if (data.beneficio !== undefined) {
      const beneficio = parseMoney(data.beneficio) ?? 0;
      const { parteVulkasoft, parteBluedrone } = splitProfit(beneficio);
      updateData.beneficio = beneficio;
      updateData.parteVulkasoft = parteVulkasoft;
      updateData.parteBluedrone = parteBluedrone;
    }
    if (data.estado !== undefined) updateData.estado = data.estado;
    if (data.fechaVenta !== undefined)
      updateData.fechaVenta = data.fechaVenta ? new Date(data.fechaVenta) : null;
    if (data.fechaPago !== undefined)
      updateData.fechaPago = data.fechaPago ? new Date(data.fechaPago) : null;
    if (data.notas !== undefined) updateData.notas = data.notas || null;

    const profitShare = await prisma.profitShare.update({
      where: { id: params.id },
      data: updateData,
      include: {
        files: { orderBy: { uploadedAt: "desc" } },
        budget: budgetInclude,
      },
    });

    return NextResponse.json({ profitShare });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Error updating profit share:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profitShare = await prisma.profitShare.findUnique({
      where: { id: params.id },
      include: { files: true },
    });
    if (!profitShare) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    for (const f of profitShare.files) {
      try {
        await deleteFile(f.s3Key);
      } catch (e) {
        console.error("Error deleting profit share file from storage:", e);
      }
    }

    await prisma.profitShare.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting profit share:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
