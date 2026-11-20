import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFileUrl } from "@/lib/s3-files";
import { z } from "zod";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const schema = z.object({
  gestorEmail: z.string().email("Email del gestor no válido"),
  copiaEmails: z.string().optional().nullable(),
  mensaje: z.string().optional().nullable(),
});

const TIPO_LABELS: Record<string, string> = {
  FACTURA_COMPRA: "Factura de compra (gasto)",
  FACTURA: "Factura de venta",
  PRESUPUESTO: "Presupuesto",
  OTRO: "Documento",
};

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const data = schema.parse(body);

    const budget = await prisma.budget.findUnique({
      where: { id: params.id },
      include: { files: { orderBy: { uploadedAt: "asc" } } },
    });
    if (!budget) {
      return NextResponse.json({ error: "Presupuesto no encontrado" }, { status: 404 });
    }

    const files = budget.files ?? [];
    if (files.length === 0) {
      return NextResponse.json(
        { error: "No hay documentos que enviar en este presupuesto" },
        { status: 400 }
      );
    }

    // Build 7-day download links for each file
    const linkItems: { filename: string; tipo: string; url: string }[] = [];
    for (const f of files) {
      const url = await getFileUrl(f.s3Key, f.isPublic, f.filename, 7 * 24 * 60 * 60);
      linkItems.push({ filename: f.filename, tipo: f.tipo, url });
    }

    // Group: purchase invoices first, then the rest
    const order = ["FACTURA_COMPRA", "FACTURA", "PRESUPUESTO", "OTRO"];
    linkItems.sort((a, b) => order.indexOf(a.tipo) - order.indexOf(b.tipo));

    const ref =
      budget.contasimpleNumber ||
      budget.numeroFactura ||
      budget.nombre ||
      "(sin número)";
    const cliente = budget.cliente || budget.nombre || "";

    const rowsHtml = linkItems
      .map(
        (it) => `
        <tr>
          <td style="padding:8px 10px; border-bottom:1px solid #e5e7eb; font-size:13px; color:#6b7280; white-space:nowrap;">${
            TIPO_LABELS[it.tipo] || "Documento"
          }</td>
          <td style="padding:8px 10px; border-bottom:1px solid #e5e7eb; font-size:13px; color:#111827;">${
            it.filename
          }</td>
          <td style="padding:8px 10px; border-bottom:1px solid #e5e7eb; font-size:13px; white-space:nowrap;"><a href="${
            it.url
          }" style="color:#2563EB; text-decoration:none; font-weight:600;">⬇ Descargar</a></td>
        </tr>`
      )
      .join("");

    const numFacturasCompra = linkItems.filter((i) => i.tipo === "FACTURA_COMPRA").length;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
        <div style="background:#0f1d36; color:#fff; padding:20px; border-radius:8px 8px 0 0;">
          <h2 style="margin:0; font-size:20px;">Documentación del presupuesto ${ref}</h2>
          <p style="margin:6px 0 0; font-size:13px; opacity:.85;">Grupo Bluedrone · Gestión DJI</p>
        </div>
        <div style="border:1px solid #e5e7eb; border-top:none; padding:24px; border-radius:0 0 8px 8px;">
          <table style="width:100%; border-collapse:collapse; margin-bottom:18px;">
            <tr><td style="padding:4px 0; font-size:13px; color:#6b7280;">Referencia</td><td style="padding:4px 0; font-size:13px; font-weight:600; color:#111827; text-align:right;">${ref}</td></tr>
            ${cliente ? `<tr><td style=\"padding:4px 0; font-size:13px; color:#6b7280;\">Cliente</td><td style=\"padding:4px 0; font-size:13px; font-weight:600; color:#111827; text-align:right;\">${cliente}</td></tr>` : ""}
            ${budget.numeroFactura ? `<tr><td style=\"padding:4px 0; font-size:13px; color:#6b7280;\">Nº Factura</td><td style=\"padding:4px 0; font-size:13px; font-weight:600; color:#111827; text-align:right;\">${budget.numeroFactura}</td></tr>` : ""}
            <tr><td style="padding:4px 0; font-size:13px; color:#6b7280;">Facturas de compra (gastos)</td><td style="padding:4px 0; font-size:13px; font-weight:600; color:#111827; text-align:right;">${numFacturasCompra}</td></tr>
            <tr><td style="padding:4px 0; font-size:13px; color:#6b7280;">Total de documentos</td><td style="padding:4px 0; font-size:13px; font-weight:600; color:#111827; text-align:right;">${linkItems.length}</td></tr>
          </table>

          ${
            data.mensaje
              ? `<div style=\"background:#f9fafb; padding:14px; border-radius:8px; margin-bottom:18px; border-left:4px solid #2563EB;\"><p style=\"margin:0; font-size:14px; color:#374151; white-space:pre-wrap;\">${data.mensaje}</p></div>`
              : ""
          }

          <p style="font-size:14px; color:#374151; margin:0 0 10px;">Adjuntamos a continuación los enlaces de descarga de todas las facturas y documentos correspondientes a este presupuesto:</p>
          <table style="width:100%; border-collapse:collapse; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="padding:8px 10px; text-align:left; font-size:12px; color:#6b7280; text-transform:uppercase;">Tipo</th>
                <th style="padding:8px 10px; text-align:left; font-size:12px; color:#6b7280; text-transform:uppercase;">Documento</th>
                <th style="padding:8px 10px; text-align:left; font-size:12px; color:#6b7280; text-transform:uppercase;"></th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>

          <p style="font-size:12px; color:#9ca3af; margin:16px 0 0;">Los enlaces de descarga son válidos durante 7 días.</p>
          <hr style="border:none; border-top:1px solid #e5e7eb; margin:20px 0;" />
          <p style="color:#9ca3af; font-size:12px; text-align:center; margin:0;">Enviado desde Gestión DJI · Grupo Bluedrone</p>
        </div>
      </div>
    `;

    // Recipients: gestor + copies
    const copias = (data.copiaEmails || "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    const recipients = Array.from(new Set([data.gestorEmail.trim(), ...copias]));

    const appUrl = process.env.NEXTAUTH_URL || "";
    const errors: string[] = [];
    let sentCount = 0;

    for (const email of recipients) {
      try {
        const res = await sendEmail({ to: email, subject: `Documentación presupuesto ${ref}`, html: htmlBody, fromName: "Gestión DJI" });
        if (res.ok) {
          sentCount++;
        } else {
          errors.push(`${email}: ${res.error || "error"}`);
        }
      } catch (emailError) {
        errors.push(`${email}: ${String(emailError)}`);
      }
    }

    // Log to budget history
    try {
      await prisma.auditLog.create({
        data: {
          budgetId: params.id,
          userId: session.user.id,
          accion: "UPDATE",
          detalles: `Documentación enviada al gestor (${data.gestorEmail}${
            copias.length ? `, copia: ${copias.join(", ")}` : ""
          }) · ${linkItems.length} documento(s)`,
        },
      });
    } catch {}

    return NextResponse.json({
      success: sentCount > 0,
      sentTo: sentCount,
      totalRecipients: recipients.length,
      errors: errors.length > 0 ? errors : undefined,
      message:
        sentCount > 0
          ? `Enviado a ${sentCount} destinatario(s)`
          : "No se pudo enviar ningún correo",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Error sending to gestor:", error);
    return NextResponse.json({ error: "Error al enviar la documentación" }, { status: 500 });
  }
}
