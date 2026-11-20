export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pullEventsFromGoogle, pushAllLocalEvents } from "@/lib/google-calendar";

export async function POST(_request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const pushed = await pushAllLocalEvents(session.user.id);
    const pulled = await pullEventsFromGoogle(session.user.id);
    return NextResponse.json({
      success: true,
      pushed: pushed.pushed,
      imported: pulled.imported,
      updated: pulled.updated,
      deleted: pulled.deleted,
    });
  } catch (e: any) {
    console.error("Sync error:", e?.message || e);
    return NextResponse.json({ error: "Error al sincronizar" }, { status: 500 });
  }
}
