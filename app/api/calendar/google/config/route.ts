export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  calendarId: z.string().min(1).optional(),
  calendarName: z.string().optional(),
  syncDirection: z.enum(["bidirectional", "push_only", "read_only"]).optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const account = await prisma.googleCalendarAccount.findUnique({
    where: { userId: session.user.id },
  });
  if (!account) {
    return NextResponse.json({ error: "No conectado" }, { status: 400 });
  }
  try {
    const body = await request.json();
    const data = schema.parse(body);
    const updated = await prisma.googleCalendarAccount.update({
      where: { userId: session.user.id },
      data,
    });
    return NextResponse.json({
      success: true,
      account: {
        calendarId: updated.calendarId,
        calendarName: updated.calendarName,
        syncDirection: updated.syncDirection,
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: e.errors }, { status: 400 });
    }
    return NextResponse.json({ error: "Error al guardar configuración" }, { status: 500 });
  }
}
