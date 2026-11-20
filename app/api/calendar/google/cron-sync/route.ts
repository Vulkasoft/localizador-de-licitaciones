export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pullEventsFromGoogle, pushAllLocalEvents } from "@/lib/google-calendar";

// Automatic background sync for ALL connected Google Calendar accounts.
// Protected by a shared secret so it can be triggered by the scheduled task.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.ALARM_CRON_SECRET;
  const authorized =
    !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!authorized) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const accounts = await prisma.googleCalendarAccount.findMany({
    select: { userId: true, syncDirection: true },
  });

  const results: any[] = [];
  for (const acc of accounts) {
    try {
      const pushed = await pushAllLocalEvents(acc.userId);
      const pulled = await pullEventsFromGoogle(acc.userId);
      results.push({
        userId: acc.userId,
        pushed: pushed.pushed,
        imported: pulled.imported,
        updated: pulled.updated,
        deleted: pulled.deleted,
      });
    } catch (e: any) {
      console.error("cron-sync error for user", acc.userId, e?.message || e);
      results.push({ userId: acc.userId, error: true });
    }
  }

  return NextResponse.json({
    success: true,
    accounts: accounts.length,
    results,
    ranAt: new Date().toISOString(),
  });
}
