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
    .enum(["TRANSFERENCIA", "FACTURA_VULKASOFT", "OTRO"])
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

    const profitShare = await prisma.profitShare.findUnique({
      where: { id: params.id },
    });
    if (!profitShare) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const data = presignedSchema.parse(body);

    const { uploadUrl, cloud_storage_path } = await generatePresignedUploadUrl(
      data.fileName,
      data.contentType,
      false
    );

    const file = await prisma.profitShareFile.create({
      data: {
        profitShareId: params.id,
        filename: data.fileName,
        s3Key: cloud_storage_path,
        tipo: data.fileType,
        isPublic: false,
      },
    });

    return NextResponse.json({
      uploadUrl,
      cloud_storage_path,
      fileId: file.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Error generating presigned URL:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
