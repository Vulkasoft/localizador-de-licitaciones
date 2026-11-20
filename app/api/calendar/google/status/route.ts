export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(_request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const account = await prisma.googleCalendarAccount.findUnique({
    where: { userId: session.user.id },
    select: {
      email: true,
      calendarId: true,
      calendarName: true,
      syncDirection: true,
      lastSyncAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ connected: !!account, account: account || null });
}
