import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getFileUrl } from "@/lib/s3-files";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // Verify secret for cron security.
    // Primary: dedicated ALARM_CRON_SECRET (stable, does not rotate).
    const authHeader = request.headers.get("authorization") || "";
    const cronSecret = process.env.ALARM_CRON_SECRET;

    const authorized =
      !!cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (!authorized) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // Recovery: re-activate alarms that were marked ENVIADA by the old logic
    // but whose deadline hasn't passed yet — they should keep sending daily
    await prisma.alarm.updateMany({
      where: {
        estado: "ENVIADA",
        fechaLimite: { gte: now },
      },
      data: { estado: "ACTIVA" },
    });

    // Find all ACTIVA alarms — we'll decide per-alarm whether to send today
    const activeAlarms = await prisma.alarm.findMany({
      where: {
        estado: "ACTIVA",
      },
      include: {
        user: { select: { name: true, email: true } },
        budget: { select: { id: true, nombre: true, cliente: true, tipo: true, tipoCustom: true, estado: true } },
        note: { select: { estado: true } },
        alarmFiles: true,
      },
    });

    const results: { id: string; titulo: string; action: string; error?: string }[] = [];

    for (const alarm of activeAlarms) {
      const deadlineDate = new Date(alarm.fechaLimite);
      deadlineDate.setHours(0, 0, 0, 0);

      // Calculate trigger date: fechaLimite - diasAntelacion days
      const triggerDate = new Date(deadlineDate);
      triggerDate.setDate(triggerDate.getDate() - alarm.diasAntelacion);

      // If deadline has already passed (today > deadline), mark as VENCIDA
      if (todayStart.getTime() > deadlineDate.getTime()) {
        await prisma.alarm.update({
          where: { id: alarm.id },
          data: { estado: "VENCIDA" },
        });
        results.push({ id: alarm.id, titulo: alarm.titulo, action: "VENCIDA" });
        continue;
      }

      // If the linked note (Seguimiento task) is finished, cancel the alarm
      // so no more reminder emails are sent.
      const NOTE_DONE_STATUSES = ["DONE", "COMPLETED"];
      if (alarm.note && NOTE_DONE_STATUSES.includes(alarm.note.estado)) {
        await prisma.alarm.update({
          where: { id: alarm.id },
          data: { estado: "CANCELADA" },
        });
        results.push({ id: alarm.id, titulo: alarm.titulo, action: `CANCELADA_POR_NOTA_${alarm.note.estado}` });
        continue;
      }

      // If the linked budget has been sent (licitación/presupuesto enviado), skip and cancel alarm
      const SENT_STATUSES = ["LICITACION_ENVIADA", "PRESUPUESTO_ENVIADO", "ENTREGADO", "PAGADO"];
      if (alarm.budget && SENT_STATUSES.includes(alarm.budget.estado)) {
        await prisma.alarm.update({
          where: { id: alarm.id },
          data: { estado: "CANCELADA" },
        });
        results.push({ id: alarm.id, titulo: alarm.titulo, action: `CANCELADA_POR_ESTADO_${alarm.budget.estado}` });
        continue;
      }

      // If today hasn't reached the trigger date yet, skip
      if (todayStart.getTime() < triggerDate.getTime()) {
        results.push({ id: alarm.id, titulo: alarm.titulo, action: "ESPERANDO" });
        continue;
      }

      // We're in the alert window (triggerDate <= today <= deadline)
      // Check if we already sent an email TODAY (avoid duplicates)
      if (alarm.fechaEnvio) {
        const lastSentDate = new Date(alarm.fechaEnvio);
        lastSentDate.setHours(0, 0, 0, 0);
        if (lastSentDate.getTime() === todayStart.getTime()) {
          results.push({ id: alarm.id, titulo: alarm.titulo, action: "YA_ENVIADA_HOY" });
          continue;
        }
      }

      // --- Send daily alarm email ---
      try {
        const emails = alarm.emailsDestino.split(",").map(e => e.trim()).filter(Boolean);

        // Days remaining until deadline
        const diffTime = deadlineDate.getTime() - todayStart.getTime();
        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Build file links
        let filesHtml = "";
        if (alarm.alarmFiles.length > 0) {
          const fileLinks = [];
          for (const file of alarm.alarmFiles) {
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

        // Documents to present
        let docsHtml = "";
        if (alarm.documentos) {
          docsHtml = `
            <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #d97706;">
              <p style="margin: 0 0 8px 0; font-weight: bold; color: #92400e;">📋 Documentos a presentar:</p>
              <p style="margin: 0; white-space: pre-wrap;">${alarm.documentos}</p>
            </div>
          `;
        }

        // Budget info
        let budgetHtml = "";
        if (alarm.budget) {
          const tipoDisplay = alarm.budget.tipo === "OTRO" && alarm.budget.tipoCustom
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

        const urgencyColor = daysRemaining <= 0 ? "#dc2626" : daysRemaining <= 1 ? "#ea580c" : "#d97706";
        const urgencyText = daysRemaining <= 0
          ? "⚠️ ¡HOY ES LA FECHA LÍMITE!"
          : daysRemaining === 1
            ? "⚠️ ¡MAÑANA ES LA FECHA LÍMITE!"
            : `⏰ Quedan ${daysRemaining} días`;

        const htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: ${urgencyColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
              <h2 style="margin: 0; font-size: 20px;">${urgencyText}</h2>
              <p style="margin: 5px 0 0; font-size: 13px; opacity: 0.9;">Aviso diario - ${daysRemaining <= 0 ? "¡Hay que presentarla YA!" : `Presenta antes del ${new Date(alarm.fechaLimite).toLocaleDateString("es-ES", { day: "numeric", month: "long", timeZone: "UTC" })}`}</p>
            </div>
            <div style="border: 1px solid #e5e7eb; border-top: none; padding: 25px; border-radius: 0 0 8px 8px;">
              <h3 style="color: #1f2937; margin-top: 0;">${alarm.titulo}</h3>
              ${alarm.descripcion ? `<p style="color: #4b5563;">${alarm.descripcion}</p>` : ""}
              <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <p style="margin: 5px 0;"><strong>📅 Fecha límite:</strong> ${new Date(alarm.fechaLimite).toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}</p>
                <p style="margin: 5px 0;"><strong>👤 Creada por:</strong> ${alarm.user.name || alarm.user.email}</p>
                <p style="margin: 5px 0;"><strong>🔔 Aviso diario:</strong> Desde ${alarm.diasAntelacion} días antes de la fecha límite</p>
              </div>
              ${docsHtml}
              ${filesHtml}
              ${budgetHtml}
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
              <p style="color: #9ca3af; font-size: 12px; text-align: center;">Gestión DJI - Sistema de Alarmas (aviso diario automático)</p>
            </div>
          </div>
        `;

        const appUrl = process.env.NEXTAUTH_URL || "";
        const appName = "Gestión DJI";

        // Send to each email
        let allSent = true;
        for (const email of emails) {
          try {
            const res = await sendEmail({ to: email, subject: `🔔 ALARMA: ${alarm.titulo} - ${urgencyText}`, html: htmlBody, fromName: appName });
            if (!res.ok) {
              console.error(`Error sending to ${email}: HTTP ${res.status}`);
              allSent = false;
            }
          } catch (emailError) {
            console.error(`Error sending to ${email}:`, emailError);
            allSent = false;
          }
        }

        // Update fechaEnvio to today (tracks last send, NOT final send)
        // The alarm stays ACTIVA so it sends again tomorrow
        await prisma.alarm.update({
          where: { id: alarm.id },
          data: {
            enviada: true,
            fechaEnvio: new Date(),
            // estado stays ACTIVA — will become VENCIDA when past deadline
          },
        });

        results.push({
          id: alarm.id,
          titulo: alarm.titulo,
          action: allSent ? "EMAIL_ENVIADO" : "EMAIL_PARCIAL",
        });
      } catch (sendError) {
        console.error(`Error processing alarm ${alarm.id}:`, sendError);
        results.push({ id: alarm.id, titulo: alarm.titulo, action: "ERROR", error: String(sendError) });
      }
    }

    return NextResponse.json({
      processed: results.length,
      results,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("Error processing alarms:", error);
    return NextResponse.json({ error: "Error al procesar alarmas" }, { status: 500 });
  }
}
