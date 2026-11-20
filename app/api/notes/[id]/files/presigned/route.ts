import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generatePresignedUploadUrl } from "@/lib/s3-files";
import { z } from "zod";

export const dynamic = "force-dynamic";

const fileSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const note = await prisma.note.findUnique({ where: { id: params.id } });
    if (!note) {
      return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const data = fileSchema.parse(body);

    const { uploadUrl, cloud_storage_path } = await generatePresignedUploadUrl(
      data.fileName,
      data.contentType,
      false // private files
    );

    const noteFile = await prisma.noteFile.create({
      data: {
        noteId: params.id,
        filename: data.fileName,
        s3Key: cloud_storage_path,
        isPublic: false,
      },
    });

    return NextResponse.json({
      uploadUrl,
      cloud_storage_path,
      fileId: noteFile.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Error generating presigned URL:", error);
    return NextResponse.json({ error: "Error al generar URL de subida" }, { status: 500 });
  }
}
