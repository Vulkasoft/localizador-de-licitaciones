import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteFile } from "@/lib/s3-files";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; fileId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const file = await prisma.noteFile.findUnique({
      where: { id: params.fileId },
    });

    if (!file || file.noteId !== params.id) {
      return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
    }

    try {
      await deleteFile(file.s3Key);
    } catch (e) {
      console.error("Error deleting from S3:", e);
    }

    await prisma.noteFile.delete({ where: { id: params.fileId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting file:", error);
    return NextResponse.json({ error: "Error al eliminar archivo" }, { status: 500 });
  }
}
