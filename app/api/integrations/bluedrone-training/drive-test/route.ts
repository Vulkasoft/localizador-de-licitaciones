import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  writeDriveTestExpediente,
  writeHistoricalDriveTest,
  DriveError,
} from "@/lib/google-drive-training";

/**
 * PROTECTED DRIVE-ONLY TEST ENDPOINT.
 *
 * POST /api/integrations/bluedrone-training/drive-test
 *
 * Creates (idempotently) a fictitious test expediente in Google Drive under
 *   ALUMNOS / 2026 / _PRUEBAS_AUTOMATIZACION / ALU-TEST-000001 - Alumno Prueba
 * with three minimal test PDFs and the 04 - Documentacion subfolder.
 *
 * It writes ONLY to Google Drive. It NEVER touches Contasimple (no customers,
 * no invoices, no payments) and it does NOT depend on BLUEDRONE_TRAINING_DRY_RUN.
 *
 * Protected with the same HMAC-SHA256 shared secret as the paid-order webhook:
 *   header x-bdf-signature: sha256=<hex of HMAC_SHA256(secret, rawBody)>
 */

export const dynamic = "force-dynamic";

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const aa = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

function verifySignature(raw: string, signatureHeader: string | null): boolean {
  const secret = process.env.BLUEDRONE_TRAINING_WEBHOOK_SECRET || "";
  if (!secret || !signatureHeader) return false;
  const supplied = signatureHeader.replace(/^sha256=/i, "").trim();
  if (!/^[0-9a-f]{64}$/i.test(supplied)) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  return timingSafeEqualHex(expected, supplied);
}

export async function POST(request: Request) {
  const raw = await request.text();
  const sig = request.headers.get("x-bdf-signature");
  if (!verifySignature(raw, sig)) {
    return NextResponse.json({ success: false, error: "Firma inválida o ausente" }, { status: 401 });
  }

  let body: any = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }

  try {
    // Default to the HISTORICAL structure test (current operativa):
    //   <root> / OCTUBRE / Alumno Prueba Automatización  (payment date 2026-10-06)
    // Pass {"mode":"legacy"} to run the old ALUMNOS/2026/_PRUEBAS test instead.
    if (body?.mode === "legacy") {
      const result = await writeDriveTestExpediente();
      return NextResponse.json({
        success: true,
        test: true,
        mode: "legacy",
        note: "Prueba de escritura SOLO en Google Drive. Contasimple no recibe ninguna escritura.",
        ...result,
      });
    }

    const paymentDate = typeof body?.payment_date === "string" ? body.payment_date : "2026-10-06";
    const firstName = typeof body?.first_name === "string" ? body.first_name : "Alumno Prueba Automatización";
    const lastName = typeof body?.last_name === "string" ? body.last_name : "";
    const result = await writeHistoricalDriveTest(paymentDate, firstName, lastName);
    return NextResponse.json({
      success: true,
      test: true,
      mode: "historical",
      note: "Prueba de escritura SOLO en Google Drive (estructura histórica). Contasimple no recibe ninguna escritura.",
      ...result,
    });
  } catch (e: any) {
    const code = e instanceof DriveError ? e.code : "UNKNOWN";
    const recoverable = e instanceof DriveError ? e.recoverable : true;
    return NextResponse.json(
      { success: false, error: e?.message || String(e), code, recoverable },
      { status: 500 }
    );
  }
}
