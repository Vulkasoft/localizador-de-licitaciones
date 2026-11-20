import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const schema = z.object({
  titulo: z.string().min(1, "El título es obligatorio"),
  descripcion: z.string().optional().nullable(),
  documentos: z.string().optional().nullable(),
  fechaLimite: z.string().optional().nullable(),
  emailsDestino: z.string().min(1, "Debe indicar al menos un email"),
});

// POST: send an IMMEDIATE email aviso for an alarm (one-off, not persisted)
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
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

    // Optional deadline info
    let deadlineHtml = "";
    if (data.fechaLimite) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const deadlineDate = new Date(data.fechaLimite);
      deadlineDate.setHours(0, 0, 0, 0);
      const diffTime = deadlineDate.getTime() - today.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const urgencyText =
        daysRemaining <= 0
          ? "⚠️ ¡FECHA LÍMITE ALCANZADA!"
          : daysRemaining === 1
          ? "⚠️ ¡MAÑANA ES LA FECHA LÍMITE!"
          : `⏰ Quedan ${daysRemaining} días`;
      deadlineHtml = `
        <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p style="margin: 5px 0;"><strong>📅 Fecha límite:</strong> ${new Date(
            data.fechaLimite
          ).toLocaleDateString("es-ES", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            timeZone: "UTC",
          })}</p>
          <p style="margin: 5px 0; font-weight: bold; color: #d97706;">${urgencyText}</p>
        </div>
      `;
    }

    let docsHtml = "";
    if (data.documentos) {
      docsHtml = `
        <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #d97706;">
          <p style="margin: 0 0 8px 0; font-weight: bold; color: #92400e;">📋 Documentos a presentar:</p>
          <p style="margin: 0; white-space: pre-wrap;">${data.documentos}</p>
        </div>
      `;
    }

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2563EB; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h2 style="margin: 0; font-size: 20px;">🔔 AVISO INMEDIATO</h2>
          <p style="margin: 5px 0 0; font-size: 13px; opacity: 0.9;">Enviado manualmente desde Alarmas</p>
        </div>
        <div style="border: 1px solid #e5e7eb; border-top: none; padding: 25px; border-radius: 0 0 8px 8px;">
          <h3 style="color: #1f2937; margin-top: 0;">${data.titulo}</h3>
          ${data.descripcion ? `<p style="color: #4b5563; white-space: pre-wrap;">${data.descripcion}</p>` : ""}
          ${deadlineHtml}
          ${docsHtml}
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
        const res = await sendEmail({ to: email, subject: `🔔 AVISO: ${data.titulo}`, html: htmlBody, fromName: appName });
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
