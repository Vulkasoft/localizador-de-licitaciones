import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFileUrl } from "@/lib/s3-files";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const alarm = await prisma.alarm.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { name: true, email: true } },
        budget: {
          select: {
            id: true,
            nombre: true,
            cliente: true,
            tipo: true,
            tipoCustom: true,
          },
        },
        alarmFiles: true,
      },
    });

    if (!alarm) {
      return NextResponse.json({ error: "Alarma no encontrada" }, { status: 404 });
    }

    const emails = alarm.emailsDestino
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);

    if (emails.length === 0) {
      return NextResponse.json(
        { error: "No hay destinatarios configurados" },
        { status: 400 }
      );
    }

    // Calculate days remaining
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadlineDate = new Date(alarm.fechaLimite);
    deadlineDate.setHours(0, 0, 0, 0);
    const diffTime = deadlineDate.getTime() - today.getTime();
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Build file links
    let filesHtml = "";
    if (alarm.alarmFiles.length > 0) {
      const fileLinks = [];
      for (const file of alarm.alarmFiles) {
        try {
          const url = await getFileUrl(file.s3Key, file.isPublic, file.filename, 7 * 24 * 60 * 60);
          fileLinks.push(
            `<li><a href="${url}" style="color: #2563EB;">${file.filename}</a></li>`
          );
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

    // Build documents section
    let docsHtml = "";
    if (alarm.documentos) {
      docsHtml = `
        <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #d97706;">
          <p style="margin: 0 0 8px 0; font-weight: bold; color: #92400e;">📋 Documentos a presentar:</p>
          <p style="margin: 0; white-space: pre-wrap;">${alarm.documentos}</p>
        </div>
      `;
    }

    // Build budget info
    let budgetHtml = "";
    if (alarm.budget) {
      const tipoDisplay =
        alarm.budget.tipo === "OTRO" && alarm.budget.tipoCustom
          ? alarm.budget.tipoCustom
          : alarm.budget.tipo;
      budgetHtml = `
        <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #16a34a;">
          <p style="margin: 0 0 8px 0; font-weight: bold; color: #166534;">📄 Presupuesto vinculado:</p>
          <p style="margin: 0;">Nombre: ${alarm.budget.nombre || "(sin nombre)"}</p>
          <p style="margin: 0;">Cliente: ${alarm.budget.cliente || "(sin cliente)"}</p>
          <p style="margin: 0;">Tipo: ${tipoDisplay}</p>
        </div>
      `;
    }

    const urgencyColor =
      daysRemaining <= 0 ? "#dc2626" : daysRemaining <= 1 ? "#ea580c" : "#d97706";
    const urgencyText =
      daysRemaining <= 0
        ? "⚠️ ¡FECHA LÍMITE ALCANZADA!"
        : daysRemaining === 1
        ? "⚠️ ¡MAÑANA ES LA FECHA LÍMITE!"
        : `⏰ Quedan ${daysRemaining} días`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #6366f1; color: white; padding: 10px 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <p style="margin: 0; font-size: 13px;">🧪 CORREO DE PRUEBA — Esta alarma no ha cambiado de estado</p>
        </div>
        <div style="background: ${urgencyColor}; color: white; padding: 20px; text-align: center;">
          <h2 style="margin: 0; font-size: 20px;">${urgencyText}</h2>
        </div>
        <div style="border: 1px solid #e5e7eb; border-top: none; padding: 25px; border-radius: 0 0 8px 8px;">
          <h3 style="color: #1f2937; margin-top: 0;">${alarm.titulo}</h3>
          ${alarm.descripcion ? `<p style="color: #4b5563;">${alarm.descripcion}</p>` : ""}
          <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <p style="margin: 5px 0;"><strong>📅 Fecha límite:</strong> ${new Date(
              alarm.fechaLimite
            ).toLocaleDateString("es-ES", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            })}</p>
            <p style="margin: 5px 0;"><strong>👤 Creada por:</strong> ${alarm.user.name || alarm.user.email}</p>
          </div>
          ${docsHtml}
          ${filesHtml}
          ${budgetHtml}
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">Gestión DJI - Sistema de Alarmas (correo de prueba)</p>
        </div>
      </div>
    `;

    const appUrl = process.env.NEXTAUTH_URL || "";
    const appName = "Gestión DJI";
    const errors: string[] = [];
    let sentCount = 0;

    for (const email of emails) {
      try {
        const res = await sendEmail({ to: email, subject: `🧪 [PRUEBA] ALARMA: ${alarm.titulo}`, html: htmlBody, fromName: appName });
        if (!res.ok) {
          const errText = await res.text();
          errors.push(`${email}: ${errText}`);
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
          ? `Correo de prueba enviado a ${sentCount} destinatario(s)`
          : "No se pudo enviar ningún correo",
    });
  } catch (error) {
    console.error("Error testing alarm:", error);
    return NextResponse.json(
      { error: "Error al enviar correo de prueba" },
      { status: 500 }
    );
  }
}
