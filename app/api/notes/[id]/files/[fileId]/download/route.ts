import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFileUrl } from "@/lib/s3-files";

export const dynamic = "force-dynamic";

export async function GET(
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

    const url = await getFileUrl(file.s3Key, file.isPublic, file.filename);

    return NextResponse.json({ url, filename: file.filename });
  } catch (error) {
    console.error("Error getting download URL:", error);
    return NextResponse.json({ error: "Error al obtener URL" }, { status: 500 });
  }
}
