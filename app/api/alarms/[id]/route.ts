import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateAlarmSchema = z.object({
  titulo: z.string().min(1).optional(),
  descripcion: z.string().optional().nullable(),
  fechaLimite: z.string().optional(),
  diasAntelacion: z.number().int().min(0).optional(),
  emailsDestino: z.string().optional(),
  documentos: z.string().optional().nullable(),
  budgetId: z.string().optional().nullable(),
  estado: z.enum(["ACTIVA", "ENVIADA", "VENCIDA", "CANCELADA"]).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const alarm = await prisma.alarm.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { name: true, email: true } },
        budget: { select: { id: true, nombre: true, cliente: true, tipo: true, tipoCustom: true } },
        alarmFiles: true,
      },
    });

    if (!alarm) {
      return NextResponse.json({ error: "Alarma no encontrada" }, { status: 404 });
    }

    return NextResponse.json(alarm);
  } catch (error) {
    console.error("Error fetching alarm:", error);
    return NextResponse.json({ error: "Error al obtener la alarma" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const data = updateAlarmSchema.parse(body);

    const existing = await prisma.alarm.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "Alarma no encontrada" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (data.titulo !== undefined) updateData.titulo = data.titulo;
    if (data.descripcion !== undefined) updateData.descripcion = data.descripcion;
    if (data.fechaLimite !== undefined) updateData.fechaLimite = new Date(data.fechaLimite);
    if (data.diasAntelacion !== undefined) updateData.diasAntelacion = data.diasAntelacion;
    if (data.emailsDestino !== undefined) updateData.emailsDestino = data.emailsDestino;
    if (data.documentos !== undefined) updateData.documentos = data.documentos;
    if (data.budgetId !== undefined) updateData.budgetId = data.budgetId || null;
    if (data.estado !== undefined) {
      updateData.estado = data.estado;
      // If reactivating, reset sent status
      if (data.estado === "ACTIVA") {
        updateData.enviada = false;
        updateData.fechaEnvio = null;
      }
    }

    const alarm = await prisma.alarm.update({
      where: { id: params.id },
      data: updateData,
      include: {
        user: { select: { name: true, email: true } },
        budget: { select: { id: true, nombre: true, cliente: true } },
        alarmFiles: true,
      },
    });

    return NextResponse.json(alarm);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Error updating alarm:", error);
    return NextResponse.json({ error: "Error al actualizar la alarma" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const existing = await prisma.alarm.findUnique({
      where: { id: params.id },
      include: { alarmFiles: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Alarma no encontrada" }, { status: 404 });
    }

    // Delete associated files from S3
    if (existing.alarmFiles.length > 0) {
      const { deleteFile } = await import("@/lib/s3-files");
      for (const file of existing.alarmFiles) {
        try {
          await deleteFile(file.s3Key);
        } catch (e) {
          console.error(`Error deleting file ${file.s3Key}:`, e);
        }
      }
    }

    await prisma.alarm.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting alarm:", error);
    return NextResponse.json({ error: "Error al eliminar la alarma" }, { status: 500 });
  }
}
