import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFileUrl } from "@/lib/s3-files";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; fileId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const file = await prisma.orderFile.findUnique({
      where: { id: params.fileId },
    });

    if (!file || file.orderId !== params.id) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const fileUrl = await getFileUrl(file.s3Key, file.isPublic, file.filename);

    return NextResponse.redirect(fileUrl, { status: 307 });
  } catch (error) {
    console.error("Error downloading file:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
