import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { decideBillingCompany, buildInvoiceLines, invoicePaidTrainingOrder, TrainingInvoiceError } from "@/lib/training-invoicing";
import { getIssuedInvoicePdf, categorizePaymentMethod } from "@/lib/contasimple";
import {
  writeHistoricalExpedientes,
  buildHistoricalDrivePath,
  DriveError,
  HistoricalExpedienteStudentInput,
} from "@/lib/google-drive-training";

// Controles independientes de escritura: Drive y Contasimple se pueden activar
// por separado para poder probarlos de forma aislada.
//  - BLUEDRONE_TRAINING_DRY_RUN: compatibilidad; si true NO se escribe nada (preview global).
//  - BLUEDRONE_TRAINING_DRIVE_WRITE_ENABLED: si true, se escribe REALMENTE en Google Drive.
//  - BLUEDRONE_TRAINING_CONTASIMPLE_WRITE_ENABLED: si true, se crea/registra REALMENTE en Contasimple.
const DRY_RUN = String(process.env.BLUEDRONE_TRAINING_DRY_RUN || "").toLowerCase() === "true";
const DRIVE_WRITE_ENABLED = String(process.env.BLUEDRONE_TRAINING_DRIVE_WRITE_ENABLED || "").toLowerCase() === "true";
const CONTASIMPLE_WRITE_ENABLED = String(process.env.BLUEDRONE_TRAINING_CONTASIMPLE_WRITE_ENABLED || "").toLowerCase() === "true";

// Allowlist de PROTECCIÓN (solo STAGING): cuando esta variable está definida (no
// vacía) y CONTASIMPLE_WRITE_ENABLED=true, Contasimple SOLO podrá escribir si el
// idempotency_key recibido coincide EXACTAMENTE con ella. Si no coincide, no se
// crea cliente, ni factura, ni cobro, y se devuelve contasimple.status =
// "BLOCKED_BY_ALLOWLIST". En PRODUCCIÓN esta variable se deja SIN definir ->
// allowlist desactivada -> el comportamiento de producción no se ve afectado.
const CONTASIMPLE_ALLOWED_IDEMPOTENCY_KEY = String(
  process.env.BLUEDRONE_TRAINING_CONTASIMPLE_ALLOWED_IDEMPOTENCY_KEY || ""
).trim();

export const dynamic = "force-dynamic";

const lineSchema = z.object({
  product_id: z.number().int().nonnegative().optional().default(0),
  name: z.string().min(1, "Cada línea necesita el nombre del producto/curso"),
  quantity: z.number().positive("La cantidad/plazas de la línea debe ser mayor que 0"),
  total_price_tax_excl: z.number().finite("Importe de línea sin impuestos no válido"),
  total_price_tax_incl: z.number().finite("Importe de línea con impuestos no válido"),
});

const pdfSchema = z.object({
  filename: z.string().min(1),
  mime: z.string().min(1),
  base64: z.string().min(1),
}).nullable().optional();

const payloadSchema = z.object({
  event: z.literal("bluedrone.training.order.paid.v1"),
  idempotency_key: z.string().min(1),
  occurred_at: z.string().min(1),
  order: z.object({
    id: z.number().int().positive(),
    reference: z.string().min(1, "Falta la referencia del pedido (order.reference)"),
    date_add: z.string().min(1),
    paid_at: z.string().min(1, "Falta la fecha de pago del pedido (order.paid_at)"),
    total_paid: z.number().positive(),
    total_paid_tax_incl: z.number().optional().nullable(),
    total_discounts_tax_excl: z.number().optional().default(0),
    total_discounts_tax_incl: z.number().optional().default(0),
    total_shipping_tax_excl: z.number().optional().default(0),
    total_shipping_tax_incl: z.number().optional().default(0),
    currency: z.string().default("EUR"),
    payment: z.string().min(1, "Falta el método de pago del pedido (order.payment)"),
    // Solo para transferencia bancaria: true cuando el dinero ya se ha recibido/
    // aceptado en PrestaShop. Si falta o es false en una transferencia, la factura
    // se crea pero NO se marca como cobrada. Se ignora para TPV/Redsys y PayPal.
    payment_accepted: z.boolean().optional(),
    paid: z.boolean().optional(),
    // Nombre técnico del módulo de pago de PrestaShop (p. ej. "redsys",
    // "paypal", "ps_wirepayment"). Solo se usa para trazabilidad/diagnóstico;
    // la categorización del método se hace sobre order.payment.
    payment_module: z.string().optional().nullable(),
    // Estado actual del pedido en PrestaShop (OrderState). Solo informativo:
    // el webhook únicamente se dispara cuando el estado está marcado como pagado.
    current_state: z.union([z.string(), z.number()]).optional().nullable(),
    lines: z.array(lineSchema).min(1),
  }),
  billing: z.object({
    company: z.enum(["canarias", "peninsula", "manual_review"]),
    source: z.string().optional().nullable(),
    reason: z.string().optional().nullable(),
    can_invoice_automatically: z.boolean(),
    customer: z
      .object({
        company_name: z.string().optional().nullable(),
        firstname: z.string().optional().nullable(),
        lastname: z.string().optional().nullable(),
        tax_id: z
          .string({ required_error: "El NIF/CIF/NIE de facturación es obligatorio" })
          .min(1, "El NIF/CIF/NIE de facturación es obligatorio"),
        address1: z.string().min(1, "Falta la dirección de facturación (address1)"),
        address2: z.string().optional().nullable(),
        postcode: z.string().optional().nullable(),
        city: z.string().min(1, "Falta la ciudad de la dirección de facturación (city)"),
        province: z.string().optional().nullable(),
        country: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        email: z.string().email("El email de facturación no es válido").optional().nullable(),
      })
      // Datos de facturación MÍNIMOS para poder emitir la factura y decidir la
      // sociedad emisora de forma determinista. Si faltan, se rechaza el pedido
      // con error claro por campo (no se degrada a manual_review silencioso).
      .superRefine((c, ctx) => {
        const has = (v?: string | null) => typeof v === "string" && v.trim().length > 0;
        const hasName = has(c.company_name) || (has(c.firstname) && has(c.lastname));
        if (!hasName) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["company_name"],
            message:
              "Falta el nombre o la razón social de facturación (company_name, o firstname + lastname)",
          });
        }
        if (!has(c.country)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["country"],
            message: "Falta el país de la dirección de facturación",
          });
        }
        if (!has(c.postcode)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["postcode"],
            message: "Falta el código postal de la dirección de facturación",
          });
        }
        // provincia OPCIONAL: en pedidos reales de PrestaShop id_state=0 => province="".
        // NO se rechaza por falta de provincia. La sede se decide por country+postcode.
        // Si province viene informada, decideBillingCompany la usa para detectar contradicciones.
      }),
  }),
  students: z.array(z.object({
    enrollment_id: z.number().int().positive(),
    student_code: z.string().min(1),
    course_name: z.string().min(1),
    first_name: z.string().min(1),
    last_name: z.string().min(1),
    matricula_pdf: pdfSchema,
    payment_receipt_pdf: pdfSchema,
  }).passthrough()).min(1),
  targets: z.object({
    contasimple: z.boolean().default(true),
    google_drive: z.boolean().default(true),
    // IGNORADOS a propósito: la ÚNICA fuente de verdad para la raíz de Drive es
    // BLUEDRONE_DRIVE_ROOT_FOLDER_ID (servidor). El payload no decide la raíz,
    // porque el módulo v0.2.5 puede arrastrar referencias históricas antiguas.
    drive_root_id: z.string().optional().nullable(),
    drive_root_name: z.string().optional().nullable(),
    administration_email: z.string().email().optional().nullable(),
  }).passthrough(),
}).passthrough();

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

/**
 * Clave de idempotencia CANÓNICA del pedido: `prestashop-order-{order.id}`.
 * Acepta como entrada `bdf-order-{id}` o `prestashop-order-{id}` y normaliza ambas
 * a la canónica. Si la clave de entrada referencia un order_id DISTINTO al del
 * pedido, devuelve error (el llamador responde 400). Si no tiene un order_id
 * reconocible, simplemente se usa la canónica derivada de order.id.
 */
function canonicalIdempotencyKey(
  rawKey: string,
  orderId: number
): { key: string; error?: string } {
  const canonical = `prestashop-order-${orderId}`;
  const m = /^(?:bdf|prestashop)-order-(\d+)$/i.exec((rawKey || "").trim());
  if (m) {
    const keyedId = Number(m[1]);
    if (Number.isFinite(keyedId) && keyedId !== orderId) {
      return {
        key: canonical,
        error: `La idempotency_key (${rawKey}) referencia el pedido ${keyedId}, distinto de order.id (${orderId})`,
      };
    }
  }
  return { key: canonical };
}

/** Map the webhook payload students to the historical-expediente input shape. */
function mapHistoricalStudents(payload: any): HistoricalExpedienteStudentInput[] {
  return (payload.students || []).map((s: any) => ({
    enrollmentId: s.enrollment_id,
    studentCode: s.student_code,
    firstName: s.first_name,
    lastName: s.last_name,
    courseName: s.course_name || null,
    matriculaPdf: s.matricula_pdf || null,
    justificantePdf: s.payment_receipt_pdf || null,
  }));
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-bdf-signature"))) {
    return NextResponse.json({ success: false, error: "Firma HMAC no válida" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ success: false, error: "JSON no válido" }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Payload no válido", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const payload = parsed.data;

  // Idempotencia canónica: normaliza bdf-order-{id} / prestashop-order-{id} y
  // rechaza si la clave referencia un pedido distinto a order.id.
  const idem = canonicalIdempotencyKey(payload.idempotency_key, payload.order.id);
  if (idem.error) {
    return NextResponse.json(
      { success: false, error: "Idempotency key incompatible con el pedido", details: idem.error },
      { status: 400 }
    );
  }
  const idempotencyKey = idem.key; // SIEMPRE prestashop-order-{order.id}

  const customer = payload.billing.customer;
  const billingInput = {
    organization: customer.company_name || null,
    firstname: customer.firstname || null,
    lastname: customer.lastname || null,
    nif: customer.tax_id,
    address: [customer.address1, customer.address2].filter(Boolean).join(" ").trim() || null,
    province: customer.province || null,
    city: customer.city || null,
    postalCode: customer.postcode || null,
    countryIso: customer.country || "ES",
    phone: customer.phone || null,
    email: customer.email || null,
  };

  const serverDecision = decideBillingCompany(billingInput);
  if (
    serverDecision.company === "manual_review" ||
    payload.billing.company === "manual_review" ||
    serverDecision.company !== payload.billing.company
  ) {
    return NextResponse.json({
      success: true,
      complete: false,
      contasimple: {
        status: "REVIEW",
        customer_id: "",
        invoice_id: "",
        invoice_number: "",
        company: payload.billing.company,
        reason:
          serverDecision.company !== payload.billing.company
            ? `La sede calculada por el servidor (${serverDecision.company}) no coincide con PrestaShop (${payload.billing.company})`
            : serverDecision.reason,
      },
      drive: {
        status: "PENDING_INVOICE",
        students: [],
      },
    });
  }

  // Mapeo del método de pago a las categorías reales de BlueDrone (TPV/Redsys,
  // PayPal, Transferencia). Si el método no está mapeado -> manual_review (no se
  // emite ni cobra; nunca se usa Efectivo como fallback).
  const paymentCategory = categorizePaymentMethod(payload.order.payment);
  if (paymentCategory === "UNMAPPED") {
    return NextResponse.json({
      success: true,
      complete: false,
      contasimple: {
        status: "REVIEW",
        customer_id: "",
        invoice_id: "",
        invoice_number: "",
        company: serverDecision.company,
        payment_method_input: payload.order.payment,
        payment_module: payload.order.payment_module ?? null,
        payment_category: paymentCategory,
        current_state: payload.order.current_state ?? null,
        reason:
          `Método de pago no mapeado ("${payload.order.payment}"). Debe asignarse ` +
          `manualmente a TPV/Redsys, PayPal o Transferencia; no se emite ni cobra automáticamente.`,
      },
      drive: {
        status: "PENDING_INVOICE",
        students: [],
      },
    });
  }

  const invoiceInput = {
    orderId: payload.order.id,
    orderReference: payload.order.reference || null,
    paidAt: payload.order.paid_at || payload.order.date_add || payload.occurred_at,
    paymentMethod: payload.order.payment || null,
    billing: billingInput,
    lines: payload.order.lines.map((line) => ({
      productId: line.product_id || null,
      productName: line.name,
      quantity: line.quantity,
      totalPriceTaxExcl: line.total_price_tax_excl,
      totalPriceTaxIncl: line.total_price_tax_incl,
    })),
    totalDiscountsTaxExcl: payload.order.total_discounts_tax_excl || 0,
    totalDiscountsTaxIncl: payload.order.total_discounts_tax_incl || 0,
    totalShippingTaxExcl: payload.order.total_shipping_tax_excl || 0,
    totalShippingTaxIncl: payload.order.total_shipping_tax_incl || 0,
    totalPaidTaxIncl: payload.order.total_paid_tax_incl ?? payload.order.total_paid,
    markPaid: true,
    paymentAccepted:
      payload.order.payment_accepted === true || payload.order.paid === true,
  };

  const paidAt = payload.order.paid_at || payload.order.date_add || payload.occurred_at;
  // Los controles granulares tienen PRIORIDAD sobre DRY_RUN (que se mantiene por
  // compatibilidad): con DRIVE_WRITE_ENABLED=true se escribe en Drive aunque
  // DRY_RUN=true, y con CONTASIMPLE_WRITE_ENABLED=false nunca se toca Contasimple.
  // Allowlist de staging: activa solo si la variable está definida (no vacía).
  const allowlistActive = CONTASIMPLE_ALLOWED_IDEMPOTENCY_KEY.length > 0;
  const allowlistMatch =
    !allowlistActive || idempotencyKey === CONTASIMPLE_ALLOWED_IDEMPOTENCY_KEY;
  const contasimpleBlockedByAllowlist =
    CONTASIMPLE_WRITE_ENABLED && allowlistActive && !allowlistMatch;
  // targets SOLO puede DESACTIVAR una escritura; NUNCA activar una deshabilitada
  // por entorno. (target !== false => no bloquea; target === false => bloquea.)
  const driveTargetEnabled = payload.targets?.google_drive !== false;
  const contasimpleTargetEnabled = payload.targets?.contasimple !== false;
  const writeContasimple =
    CONTASIMPLE_WRITE_ENABLED && allowlistMatch && contasimpleTargetEnabled;
  const writeDrive = DRIVE_WRITE_ENABLED && driveTargetEnabled;

  // =====================================================================
  // FASE 1 — CONTASIMPLE (independiente de Drive)
  // =====================================================================
  let contasimple: any;
  let invoiceResult: Awaited<ReturnType<typeof invoicePaidTrainingOrder>> | null = null;
  let contasimpleDone = false;

  if (writeContasimple) {
    try {
      invoiceResult = await invoicePaidTrainingOrder(invoiceInput);
      contasimple = {
        status: invoiceResult.paymentWarning ? "INVOICED_PAYMENT_PENDING" : "OK",
        company: invoiceResult.company,
        customer_id: String(invoiceResult.customer.id),
        invoice_id: String(invoiceResult.invoice.id),
        invoice_number: invoiceResult.invoice.number,
        period: invoiceResult.invoice.period,
        invoice_created: invoiceResult.invoice.created,
        customer_created: invoiceResult.customer.created,
        payment_assigned: invoiceResult.paymentAssigned,
        payment_warning: invoiceResult.paymentWarning,
      };
      contasimpleDone = true;
    } catch (error) {
      if (error instanceof TrainingInvoiceError) {
        const status = error.code === "MANUAL_REVIEW" ? 200 : 422;
        return NextResponse.json(
          {
            success: status === 200,
            complete: false,
            dry_run: DRY_RUN,
            drive_write_enabled: DRIVE_WRITE_ENABLED,
            contasimple_write_enabled: CONTASIMPLE_WRITE_ENABLED,
            idempotency_key: idempotencyKey,
            contasimple: {
              status: error.code === "MANUAL_REVIEW" ? "REVIEW" : "ERROR",
              error: error.message,
              code: error.code,
              details: error.details,
            },
            drive: { status: "PENDING_INVOICE", students: [] },
          },
          { status }
        );
      }
      console.error("BlueDrone training Contasimple error:", error);
      return NextResponse.json(
        { success: false, complete: false, error: "Error interno procesando la factura del pedido de formación" },
        { status: 500 }
      );
    }
  } else {
    // Contasimple en PREVIEW: valida cliente, importes, impuestos y descuentos
    // y prepara las líneas de factura SIN escribir nada en Contasimple.
    try {
      const previewLines = buildInvoiceLines(invoiceInput);
      if (contasimpleBlockedByAllowlist) {
        // Bloqueado por la allowlist de staging: NO se crea cliente, factura ni cobro.
        contasimple = {
          status: "BLOCKED_BY_ALLOWLIST",
          company: serverDecision.company,
          customer_nif: billingInput.nif,
          idempotency_reference: idempotencyKey,
          customer_created: false,
          invoice_created: false,
          payment_assigned: false,
          reason:
            `El idempotency_key recibido no coincide con ` +
            `BLUEDRONE_TRAINING_CONTASIMPLE_ALLOWED_IDEMPOTENCY_KEY; ` +
            `no se ha creado cliente, factura ni cobro en Contasimple.`,
          lines: previewLines,
        };
      } else {
        contasimple = {
          status: "PREVIEW",
          company: serverDecision.company,
          customer_nif: billingInput.nif,
          idempotency_reference: idempotencyKey,
          payment_method_input: payload.order.payment,
          payment_module: payload.order.payment_module ?? null,
          payment_category: paymentCategory,
          current_state: payload.order.current_state ?? null,
          transfer_accepted:
            payload.order.payment_accepted === true || payload.order.paid === true,
          lines: previewLines,
        };
      }
    } catch (error) {
      if (error instanceof TrainingInvoiceError) {
        return NextResponse.json(
          {
            success: false,
            complete: false,
            dry_run: DRY_RUN,
            drive_write_enabled: DRIVE_WRITE_ENABLED,
            contasimple_write_enabled: CONTASIMPLE_WRITE_ENABLED,
            contasimple: { status: "ERROR", error: error.message, code: error.code, details: error.details },
            drive: { status: "PENDING_INVOICE", students: [] },
          },
          { status: 422 }
        );
      }
      console.error("BlueDrone training preview error:", error);
      return NextResponse.json(
        { success: false, complete: false, error: "Error interno en la previsualización de la factura" },
        { status: 500 }
      );
    }
  }

  // =====================================================================
  // FASE 2 — GOOGLE DRIVE (independiente de Contasimple)
  // Paso RECUPERABLE: si Contasimple ya terminó pero Drive falla, el reintento
  // NO recrea la factura (idempotencia en Contasimple) y Drive es idempotente.
  // =====================================================================
  let drive: any;
  let driveDone = false;

  if (writeDrive) {
    try {
      // Factura real desde Contasimple SOLO si se emitió en esta ejecución;
      // si Contasimple está en PREVIEW se usa un PDF marcador de posición.
      let facturaPdf: { mime: string; base64: string } | null = null;
      if (invoiceResult) {
        try {
          const pdf = await getIssuedInvoicePdf(
            invoiceResult.company,
            invoiceResult.invoice.period,
            invoiceResult.invoice.id
          );
          facturaPdf = {
            mime: pdf.contentType || "application/pdf",
            base64: Buffer.from(pdf.bytes).toString("base64"),
          };
        } catch (pdfErr) {
          console.error("BlueDrone training: no se pudo descargar la factura de Contasimple:", pdfErr);
        }
      }

      const driveResult = await writeHistoricalExpedientes({
        paymentDate: paidAt,
        facturaPdf,
        students: mapHistoricalStudents(payload),
      });

      drive = {
        status: "OK",
        root: driveResult.root,
        year: driveResult.year,
        month: driveResult.month,
        payment_date: driveResult.payment_date,
        contasimple_writes: driveResult.contasimple_writes,
        students: driveResult.students,
      };
      driveDone = true;

      // Persistir los ids reales en la matrícula (tabla TrainingEnrollment).
      // No bloqueante: un fallo aquí no invalida la escritura en Drive.
      for (const st of driveResult.students) {
        try {
          await prisma.trainingEnrollment.upsert({
            where: { studentCode: st.student_code },
            create: {
              enrollmentId: st.enrollment_id,
              studentCode: st.student_code,
              orderId: payload.order.id,
              orderReference: payload.order.reference || null,
              courseName:
                (payload.students.find((p: any) => p.student_code === st.student_code) as any)?.course_name || null,
              firstName:
                (payload.students.find((p: any) => p.student_code === st.student_code) as any)?.first_name || null,
              lastName:
                (payload.students.find((p: any) => p.student_code === st.student_code) as any)?.last_name || null,
              company: serverDecision.company,
              driveFolderId: st.folder_id,
              driveFolderUrl: st.folder_url,
              driveMatriculaFileId: st.matricula_file_id,
              driveFacturaFileId: st.factura_file_id,
              driveJustificanteFileId: st.justificante_file_id,
              contasimpleInvoiceId: invoiceResult ? String(invoiceResult.invoice.id) : null,
              contasimpleInvoiceNumber: invoiceResult ? invoiceResult.invoice.number : null,
              paidAt: paidAt ? new Date(paidAt) : null,
            },
            update: {
              orderId: payload.order.id,
              orderReference: payload.order.reference || null,
              company: serverDecision.company,
              driveFolderId: st.folder_id,
              driveFolderUrl: st.folder_url,
              driveMatriculaFileId: st.matricula_file_id,
              driveFacturaFileId: st.factura_file_id,
              driveJustificanteFileId: st.justificante_file_id,
              ...(invoiceResult
                ? {
                    contasimpleInvoiceId: String(invoiceResult.invoice.id),
                    contasimpleInvoiceNumber: invoiceResult.invoice.number,
                  }
                : {}),
              paidAt: paidAt ? new Date(paidAt) : null,
            },
          });
        } catch (dbErr) {
          console.error("BlueDrone training: no se pudo persistir la matrícula en BD:", {
            studentCode: st.student_code,
            message: (dbErr as any)?.message,
          });
        }
      }
    } catch (driveError: any) {
      const recoverable = driveError instanceof DriveError ? driveError.recoverable : true;
      const code = driveError instanceof DriveError ? driveError.code : "DRIVE_ERROR";
      console.error("BlueDrone training Drive error (recuperable):", {
        code,
        orderId: payload.order.id,
        message: driveError?.message,
      });
      drive = {
        status: "ERROR",
        recoverable,
        code,
        error: driveError?.message || "Error subiendo a Google Drive",
        students: [],
      };
    }
  } else {
    // Drive en PREVIEW: calcula la estructura de carpetas que SE USARÍA, sin crear nada.
    const previewStudents = (payload.students || []).map((s: any) => {
      const plan = buildHistoricalDrivePath(paidAt, s.first_name, s.last_name);
      return {
        enrollment_id: s.enrollment_id,
        student_code: s.student_code,
        display_name: plan.studentFolderName,
        path: plan.path,
        files: plan.files,
      };
    });
    const sample = buildHistoricalDrivePath(paidAt, "X", "Y");
    drive = {
      status: "PREVIEW",
      year: sample.year,
      month: sample.month,
      students: previewStudents,
    };
  }

  return NextResponse.json({
    success: true,
    dry_run: DRY_RUN,
    drive_write_enabled: DRIVE_WRITE_ENABLED,
    contasimple_write_enabled: CONTASIMPLE_WRITE_ENABLED,
    contasimple_allowlist_active: allowlistActive,
    contasimple_blocked_by_allowlist: contasimpleBlockedByAllowlist,
    complete: contasimpleDone && driveDone,
    idempotency_key: idempotencyKey,
    contasimple,
    drive,
  });
}
