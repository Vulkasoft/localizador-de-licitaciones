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

    const orderFile = await prisma.orderFile.findUnique({
      where: { id: params.fileId },
    });

    if (!orderFile || orderFile.orderId !== params.id) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    try {
      await deleteFile(orderFile.s3Key);
    } catch (e) {
      console.error("Error deleting file from storage:", e);
    }

    await prisma.orderFile.delete({ where: { id: params.fileId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting file:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
