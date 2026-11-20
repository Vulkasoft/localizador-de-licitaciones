export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCalendarClientForUser } from "@/lib/google-calendar";

export async function GET(_request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const client = await getCalendarClientForUser(session.user.id);
  if (!client) {
    return NextResponse.json({ error: "No conectado" }, { status: 400 });
  }
  try {
    const res = await client.calendar.calendarList.list({ maxResults: 250 });
    const calendars = (res.data.items || []).map((c) => ({
      id: c.id,
      summary: c.summary,
      primary: !!c.primary,
      accessRole: c.accessRole,
    }));
    return NextResponse.json({ calendars });
  } catch (e: any) {
    console.error("Error listing calendars:", e?.message || e);
    return NextResponse.json({ error: "Error al listar calendarios" }, { status: 500 });
  }
}
