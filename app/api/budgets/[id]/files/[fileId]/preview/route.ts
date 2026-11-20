import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFileUrlForPreview } from "@/lib/s3-files";

export async function GET(
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

    const file = await prisma.budgetFile.findUnique({
      where: { id: params.fileId },
    });

    if (!file || file.budgetId !== params.id) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Obtener URL firmada o publica (sin redirigir)
    const fileUrl = await getFileUrlForPreview(file.s3Key, file.isPublic);

    // Devolver la URL en JSON en lugar de redirigir
    return NextResponse.json({ url: fileUrl });
  } catch (error) {
    console.error("Error getting file URL:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
