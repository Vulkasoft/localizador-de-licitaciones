import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const updateNoteSchema = z.object({
  titulo: z.string().min(1).optional(),
  descripcion: z.string().optional(),
  estado: z.enum(["PENDING", "DONE", "ATTEMPTED", "COMPLETED"]).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; noteId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const budget = await prisma.budget.findUnique({
      where: { id: params.id },
    });

    if (!budget) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const note = await prisma.note.findUnique({
      where: { id: params.noteId },
    });

    if (!note || note.budgetId !== params.id) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const body = await request.json();
    const updateData = updateNoteSchema.parse(body);

    const updatedNote = await prisma.note.update({
      where: { id: params.noteId },
      data: updateData,
      include: { user: { select: { name: true, email: true } } },
    });

    return NextResponse.json({ note: updatedNote });
  } catch (error) {
    console.error("Error updating note:", error);
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
  { params }: { params: { id: string; noteId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const budget = await prisma.budget.findUnique({
      where: { id: params.id },
    });

    if (!budget) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const note = await prisma.note.findUnique({
      where: { id: params.noteId },
    });

    if (!note || note.budgetId !== params.id) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    await prisma.note.delete({
      where: { id: params.noteId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting note:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
