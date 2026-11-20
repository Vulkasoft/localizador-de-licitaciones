import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFileUrl } from "@/lib/s3-files";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  titulo: z.string().min(1).optional(),
  descripcion: z.string().optional().nullable(),
  emailsDestino: z.string().min(1, "Debe indicar al menos un email"),
});

// POST: send an IMMEDIATE email aviso for a note (one-off, not persisted as an alarm)
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const note = await prisma.note.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { name: true, email: true } },
        budget: { select: { id: true, nombre: true, cliente: true, tipo: true, tipoCustom: true } },
        files: { orderBy: { uploadedAt: "desc" } },
      },
    });
    if (!note) {
      return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const data = schema.parse(body);

    const emails = data.emailsDestino
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      return NextResponse.json({ error: "No hay destinatarios" }, { status: 400 });
    }

    const titulo = data.titulo?.trim() || note.titulo;
    const descripcion = data.descripcion ?? note.descripcion ?? null;

    // Attached note files
    let filesHtml = "";
    if (note.files.length > 0) {
      const fileLinks: string[] = [];
      for (const file of note.files) {
        try {
          const url = await getFileUrl(file.s3Key, file.isPublic, file.filename, 7 * 24 * 60 * 60);
          fileLinks.push(`<li><a href="${url}" style="color: #2563EB;">${file.filename}</a></li>`);
        } catch {
          fileLinks.push(`<li>${file.filename} (enlace no disponible)</li>`);
        }
      }
      filesHtml = `
        <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #2563EB;">
          <p style="margin: 0 0 8px 0; font-weight: bold; color: #1e40af;">📎 Documentos adjuntos:</p>
          <ul style="margin: 0; padding-left: 20px;">${fileLinks.join("")}</ul>
        </div>
      `;
    }

    // Linked budget info
    let budgetHtml = "";
    if (note.budget) {
      const tipoDisplay =
        note.budget.tipo === "OTRO" && note.budget.tipoCustom
          ? note.budget.tipoCustom
          : note.budget.tipo;
      budgetHtml = `
        <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #16a34a;">
          <p style="margin: 0 0 8px 0; font-weight: bold; color: #166534;">📄 Presupuesto vinculado:</p>
          <p style="margin: 0;">Nombre: ${note.budget.nombre || "(sin nombre)"}</p>
          <p style="margin: 0;">Cliente: ${note.budget.cliente || "(sin cliente)"}</p>
          <p style="margin: 0;">Tipo: ${tipoDisplay}</p>
        </div>
      `;
    }

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2563EB; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h2 style="margin: 0; font-size: 20px;">🔔 AVISO INMEDIATO</h2>
          <p style="margin: 5px 0 0; font-size: 13px; opacity: 0.9;">Enviado manualmente desde Seguimiento</p>
        </div>
        <div style="border: 1px solid #e5e7eb; border-top: none; padding: 25px; border-radius: 0 0 8px 8px;">
          <h3 style="color: #1f2937; margin-top: 0;">${titulo}</h3>
          ${descripcion ? `<p style="color: #4b5563; white-space: pre-wrap;">${descripcion}</p>` : ""}
          <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <p style="margin: 5px 0;"><strong>👤 Enviado por:</strong> ${note.user.name || note.user.email}</p>
          </div>
          ${filesHtml}
          ${budgetHtml}
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">Gestión DJI - Aviso inmediato</p>
        </div>
      </div>
    `;

    const appUrl = process.env.NEXTAUTH_URL || "";
    const appName = "Gestión DJI";
    const errors: string[] = [];
    let sentCount = 0;

    for (const email of emails) {
      try {
        const res = await fetch("https://apps.abacus.ai/api/sendNotificationEmail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deployment_token: process.env.ABACUSAI_API_KEY,
            app_id: process.env.WEB_APP_ID,
            notification_id: process.env.NOTIF_ID_ALARMA_DE_PRESUPUESTOLICITACIN,
            subject: `🔔 AVISO: ${titulo}`,
            body: htmlBody,
            is_html: true,
            recipient_email: email,
            sender_email: appUrl ? `noreply@${new URL(appUrl).hostname}` : undefined,
            sender_alias: appName,
          }),
        });
        if (!res.ok) {
          errors.push(`${email}: ${await res.text()}`);
        } else {
          sentCount++;
        }
      } catch (emailError) {
        errors.push(`${email}: ${String(emailError)}`);
      }
    }

    return NextResponse.json({
      success: sentCount > 0,
      sentTo: sentCount,
      totalRecipients: emails.length,
      errors: errors.length > 0 ? errors : undefined,
      message:
        sentCount > 0
          ? `Aviso inmediato enviado a ${sentCount} destinatario(s)`
          : "No se pudo enviar ningún correo",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Error sending immediate aviso:", error);
    return NextResponse.json({ error: "Error al enviar el aviso" }, { status: 500 });
  }
}
