import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pushEventToGoogle, deleteEventFromGoogle } from "@/lib/google-calendar";
import { z } from "zod";

const updateEventSchema = z.object({
  titulo: z.string().min(1).optional(),
  descripcion: z.string().optional(),
  fechaHora: z.string().datetime().optional(),
  lugar: z.string().optional(),
  budgetId: z.string().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const event = await prisma.event.findUnique({
      where: { id: params.eventId },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const body = await request.json();
    const updateData = updateEventSchema.parse(body);

    const data: any = { ...updateData };
    if (updateData.fechaHora) {
      data.fechaHora = new Date(updateData.fechaHora);
    }
    if (updateData.budgetId === "") {
      data.budgetId = null;
    }

    const updatedEvent = await prisma.event.update({
      where: { id: params.eventId },
      data,
      include: { user: { select: { name: true } }, budget: { select: { nombre: true } } },
    });

    // Best-effort push update to Google Calendar (no-op if not connected).
    try {
      const gid = await pushEventToGoogle(session.user.id, updatedEvent as any);
      if (gid && gid !== updatedEvent.googleEventId) {
        await prisma.event.update({
          where: { id: updatedEvent.id },
          data: { googleEventId: gid, syncedAt: new Date() },
        });
      }
    } catch (e) {
      console.error("Google push (update) failed:", e);
    }

    return NextResponse.json({ event: updatedEvent });
  } catch (error) {
    console.error("Error updating event:", error);
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const event = await prisma.event.findUnique({
      where: { id: params.eventId },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Best-effort delete from Google Calendar first (no-op if not connected).
    try {
      if (event.googleEventId) {
        await deleteEventFromGoogle(session.user.id, event.googleEventId);
      }
    } catch (e) {
      console.error("Google delete failed:", e);
    }

    await prisma.event.delete({
      where: { id: params.eventId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting event:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
