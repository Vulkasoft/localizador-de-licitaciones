import nodemailer, { type Transporter } from "nodemailer";

/**
 * Envío de correo por SMTP (sustituye al servicio de notificaciones de Abacus).
 *
 * Variables de entorno:
 *   SMTP_HOST, SMTP_PORT (465 = SSL, 587 = STARTTLS), SMTP_USER, SMTP_PASSWORD
 *   SMTP_FROM        dirección remitente, p. ej. "avisos@tudominio.com"
 *   SMTP_FROM_NAME   nombre visible por defecto (opcional)
 */

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) throw new Error("SMTP no configurado (falta SMTP_HOST)");
  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || "" }
      : undefined,
  });
  return transporter;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** Nombre visible del remitente; por defecto SMTP_FROM_NAME. */
  fromName?: string;
}

/**
 * Resultado con la misma forma básica que una Response de fetch
 * (ok / status / text()) para que el código existente no cambie.
 */
export interface SendEmailResult {
  ok: boolean;
  status: number;
  error?: string;
  text(): Promise<string>;
}

function result(ok: boolean, error?: string): SendEmailResult {
  return {
    ok,
    status: ok ? 200 : 500,
    error,
    text: async () => error || "ok",
  };
}

export async function sendEmail({ to, subject, html, fromName }: SendEmailInput): Promise<SendEmailResult> {
  try {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    if (!from) throw new Error("SMTP no configurado (falta SMTP_FROM)");
    const name = fromName || process.env.SMTP_FROM_NAME;
    await getTransporter().sendMail({
      from: name ? { name, address: from } : from,
      to,
      subject,
      html,
    });
    return result(true);
  } catch (e: any) {
    console.error("[email] Error enviando a", to, e?.message || e);
    return result(false, e?.message || String(e));
  }
}
