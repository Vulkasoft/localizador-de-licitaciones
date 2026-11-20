export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCalendarClientForUser } from "@/lib/google-calendar";

export async function POST(_request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Best-effort revoke of the token at Google.
  try {
    const client = await getCalendarClientForUser(session.user.id);
    if (client) {
      await client.oauth2.revokeCredentials().catch(() => {});
    }
  } catch {}

  await prisma.googleCalendarAccount.deleteMany({ where: { userId: session.user.id } });
  // Detach local events from Google references so they remain local-only.
  await prisma.event.updateMany({
    where: { userId: session.user.id, googleEventId: { not: null } },
    data: { googleEventId: null, googleCalendarId: null, syncedAt: null },
  });
  return NextResponse.json({ success: true });
}
