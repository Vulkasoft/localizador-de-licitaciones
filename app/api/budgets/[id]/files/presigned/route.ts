import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generatePresignedUploadUrl } from "@/lib/s3-files";
import { z } from "zod";

export const dynamic = "force-dynamic";

const presignedSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  fileType: z
    .enum(["PRESUPUESTO", "FACTURA", "FACTURA_COMPRA", "OTRO"])
    .default("OTRO"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    const body = await request.json();
    const validatedData = presignedSchema.parse(body);

    const { uploadUrl, cloud_storage_path } = await generatePresignedUploadUrl(
      validatedData.fileName,
      validatedData.contentType,
      false
    );

    const budgetFile = await prisma.budgetFile.create({
      data: {
        budgetId: params.id,
        filename: validatedData.fileName,
        s3Key: cloud_storage_path,
        tipo: validatedData.fileType,
        isPublic: false,
      },
    });

    await prisma.auditLog.create({
      data: {
        budgetId: params.id,
        userId: session.user.id,
        accion: "FILE_UPLOAD",
        detalles: `Archivo subido: ${validatedData.fileName}`,
      },
    });

    return NextResponse.json({
      uploadUrl,
      cloud_storage_path,
      fileId: budgetFile.id,
    });
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
