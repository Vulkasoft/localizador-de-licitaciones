import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteFile } from "@/lib/s3-files";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; fileId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const budget = await prisma.budget.findUnique({
      where: { id: params.id },
    });

    if (!budget) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const budgetFile = await prisma.budgetFile.findUnique({
      where: { id: params.fileId },
    });

    if (!budgetFile || budgetFile.budgetId !== params.id) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    await deleteFile(budgetFile.s3Key);

    await prisma.budgetFile.delete({
      where: { id: params.fileId },
    });

    await prisma.auditLog.create({
      data: {
        budgetId: params.id,
        userId: session.user.id,
        accion: "FILE_DELETE",
        detalles: `Archivo eliminado: ${budgetFile.filename}`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting file:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
