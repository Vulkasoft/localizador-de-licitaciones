import {
  CompanyKey,
  ContasimpleCustomerInput,
  IssuedInvoiceLineInput,
  createIssuedInvoice,
  findOrCreateCustomer,
  getContasimplePeriod,
  getIssuedInvoice,
  assignInvoicePayment,
  categorizePaymentMethod,
  findTrainingPaymentMethod,
} from "@/lib/contasimple";

export type BillingCompanyDecision = CompanyKey | "manual_review";

export interface BillingAddressInput {
  organization?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  nif: string;
  address?: string | null;
  province?: string | null;
  city?: string | null;
  postalCode?: string | null;
  countryIso?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface PrestaShopOrderLineInput {
  productId?: number | null;
  productName: string;
  quantity: number;
  totalPriceTaxExcl: number;
  totalPriceTaxIncl: number;
}

export interface TrainingOrderInvoiceInput {
  orderId: number;
  orderReference?: string | null;
  paidAt: string;
  paymentMethod?: string | null;
  billing: BillingAddressInput;
  lines: PrestaShopOrderLineInput[];
  totalDiscountsTaxExcl?: number;
  totalDiscountsTaxIncl?: number;
  totalShippingTaxExcl?: number;
  totalShippingTaxIncl?: number;
  totalPaidTaxIncl: number;
  markPaid?: boolean;
  // Solo relevante para transferencia bancaria: indica que el dinero se ha
  // recibido/aceptado realmente en PrestaShop. Si es false/undefined en una
  // transferencia, se crea la factura pero NO se marca como cobrada.
  paymentAccepted?: boolean;
}

export class TrainingInvoiceError extends Error {
  code: string;
  details?: any;
  constructor(code: string, message: string, details?: any) {
    super(message);
    this.name = "TrainingInvoiceError";
    this.code = code;
    this.details = details;
  }
}

function norm(value?: string | null): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function money(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function taxRate(excl: number, incl: number): number {
  excl = Number(excl);
  incl = Number(incl);
  if (!Number.isFinite(excl) || !Number.isFinite(incl)) {
    throw new TrainingInvoiceError("INVALID_AMOUNTS", "Importes no válidos recibidos desde PrestaShop");
  }
  if (Math.abs(excl) < 0.000001) return 0;
  return money(((incl - excl) / excl) * 100);
}

/**
 * Decide which BlueDrone Contasimple company must issue the invoice.
 * Uses the billing address, not the student's address.
 */
export function decideBillingCompany(billing: BillingAddressInput): {
  company: BillingCompanyDecision;
  reason: string;
} {
  const country = norm(billing.countryIso || "ES");
  const province = norm(billing.province);
  const cp = (billing.postalCode || "").replace(/\s/g, "");

  if (country && country !== "ES" && country !== "ESP" && country !== "SPAIN" && country !== "ESPANA") {
    return { company: "manual_review", reason: `País de facturación no automatizado: ${billing.countryIso}` };
  }

  const cpCanarias = /^(35|38)\d{3}$/.test(cp);
  const provinceCanarias =
    province.includes("LAS PALMAS") ||
    province.includes("SANTA CRUZ DE TENERIFE") ||
    province === "TENERIFE";

  const cpCeutaMelilla = /^(51|52)\d{3}$/.test(cp);
  const provinceCeutaMelilla = province.includes("CEUTA") || province.includes("MELILLA");

  if (cpCeutaMelilla || provinceCeutaMelilla) {
    return { company: "manual_review", reason: "Ceuta/Melilla requiere revisión fiscal manual" };
  }

  if (cpCanarias && province && !provinceCanarias) {
    return {
      company: "manual_review",
      reason: `Contradicción: CP canario (${cp}) y provincia no canaria (${billing.province})`,
    };
  }

  if (provinceCanarias && cp && !cpCanarias) {
    return {
      company: "manual_review",
      reason: `Contradicción: provincia canaria (${billing.province}) y CP no canario (${cp})`,
    };
  }

  if (cpCanarias || provinceCanarias) {
    return { company: "canarias", reason: "Dirección de facturación de Canarias" };
  }

  if (!cp && !province) {
    return { company: "manual_review", reason: "Faltan código postal y provincia de facturación" };
  }

  return { company: "peninsula", reason: "Dirección de facturación de Península/Baleares" };
}

/**
 * Exención fiscal de FORMACIÓN.
 * En Contasimple la exención NO es un campo estructurado: la línea se emite con
 * vatPercentage = 0 y la leyenda legal va embebida en el concepto (así lo hacen
 * las facturas reales de formación de BlueDrone en Península, p.ej.
 * `... "EXENTO DE IVA ART. 20,9 LEY 37/1992"`).
 *  - Península: IVA exento, leyenda por defecto la que BlueDrone ya usa.
 *  - Canarias: NO se cita ningún artículo de IVA peninsular (allí rige el IGIC);
 *    la leyenda es neutra y configurable por env para que Jose fije la correcta
 *    sin tocar código. No se inventa artículo legal.
 */
export function trainingExencionLegend(company: CompanyKey): string {
  if (company === "canarias") {
    return (
      process.env.BLUEDRONE_TRAINING_EXENCION_LEGEND_CANARIAS ||
      "OPERACIÓN EXENTA DE IGIC – ART. 50.UNO.9º DE LA LEY 4/2012"
    ).trim();
  }
  return (
    process.env.BLUEDRONE_TRAINING_EXENCION_LEGEND_PENINSULA ||
    "OPERACIÓN EXENTA DE IVA – ART. 20.UNO.9º DE LA LEY 37/1992"
  ).trim();
}

function applyExencionLegend(concept: string, company: CompanyKey): string {
  const legend = trainingExencionLegend(company);
  if (!legend) return concept;
  const up = concept.toUpperCase();
  if (up.includes("EXENT") || up.includes(legend.toUpperCase())) return concept;
  return `${concept} "${legend}"`;
}

/**
 * Convert exact PrestaShop order totals into Contasimple invoice lines.
 * Taxes are derived from the order, never guessed from the issuing company.
 * REGLA DEFINITIVA: las líneas de FORMACIÓN llegan de PrestaShop con impuesto 0
 * (el precio del curso ES el total a facturar) -> se facturan EXENTAS (0 %) con la
 * leyenda de exención de la sociedad. Los PRODUCTOS FÍSICOS llegan con su impuesto
 * (IVA 21 % / IGIC 7 %) y conservan su fiscalidad normal, sin leyenda de exención.
 * La distinción se mantiene por el impuesto de cada línea: rate === 0 => exenta.
 */
export function buildInvoiceLines(
  input: TrainingOrderInvoiceInput,
  companyArg?: CompanyKey
): IssuedInvoiceLineInput[] {
  if (!input.lines?.length) {
    throw new TrainingInvoiceError("NO_LINES", "El pedido no contiene líneas facturables");
  }

  const decided = companyArg ?? decideBillingCompany(input.billing).company;
  const company: CompanyKey | null = decided === "manual_review" ? null : decided;

  const lines: IssuedInvoiceLineInput[] = [];
  const rates = new Set<number>();

  for (const row of input.lines) {
    const qty = Number(row.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new TrainingInvoiceError("INVALID_QUANTITY", `Cantidad no válida para ${row.productName}`);
    }
    const excl = money(row.totalPriceTaxExcl);
    const incl = money(row.totalPriceTaxIncl);
    const rate = taxRate(excl, incl);
    rates.add(rate);
    // Formación (exenta): rate === 0 -> embebe la leyenda legal de exención.
    const concept =
      rate === 0 && company ? applyExencionLegend(row.productName, company) : row.productName;
    lines.push({
      concept,
      quantity: qty,
      unitAmount: money(excl / qty),
      vatPercentage: rate,
      discountPercentage: 0,
      detailedDescription: row.productId ? `PrestaShop product_id=${row.productId}` : undefined,
    });
  }

  const discountExcl = money(input.totalDiscountsTaxExcl || 0);
  const discountIncl = money(input.totalDiscountsTaxIncl ?? discountExcl);
  if (discountExcl > 0.009) {
    if (rates.size !== 1) {
      throw new TrainingInvoiceError(
        "MIXED_TAX_DISCOUNT",
        "El pedido tiene un descuento global y varias tasas de impuesto; requiere revisión manual"
      );
    }
    const rate = taxRate(discountExcl, discountIncl);
    lines.push({
      concept: "Descuento aplicado en el pedido",
      quantity: -1,
      unitAmount: discountExcl,
      vatPercentage: rate,
      discountPercentage: 0,
    });
  }

  const shippingExcl = money(input.totalShippingTaxExcl || 0);
  const shippingIncl = money(input.totalShippingTaxIncl ?? shippingExcl);
  if (shippingExcl > 0.009 || shippingIncl > 0.009) {
    lines.push({
      concept: "Gastos de envío",
      quantity: 1,
      unitAmount: shippingExcl,
      vatPercentage: taxRate(shippingExcl, shippingIncl),
      discountPercentage: 0,
    });
  }

  const calculatedTotal = money(
    lines.reduce((sum, l) => {
      const base = l.quantity * l.unitAmount * (1 - (l.discountPercentage || 0) / 100);
      return sum + base + base * (l.vatPercentage / 100);
    }, 0)
  );
  const expectedTotal = money(input.totalPaidTaxIncl);
  if (Math.abs(calculatedTotal - expectedTotal) > 0.02) {
    throw new TrainingInvoiceError(
      "TOTAL_MISMATCH",
      `La factura calculada (${calculatedTotal.toFixed(2)} €) no coincide con el pedido pagado (${expectedTotal.toFixed(2)} €)`,
      { calculatedTotal, expectedTotal }
    );
  }

  return lines;
}

function customerInput(input: TrainingOrderInvoiceInput): ContasimpleCustomerInput {
  const b = input.billing;
  const organization =
    b.organization?.trim() ||
    [b.firstname, b.lastname].filter(Boolean).join(" ").trim();

  if (!organization) {
    throw new TrainingInvoiceError("MISSING_CUSTOMER_NAME", "Falta nombre o razón social de facturación");
  }
  if (!b.nif?.trim()) {
    throw new TrainingInvoiceError("MISSING_NIF", "Falta NIF/CIF/NIE en los datos de facturación");
  }

  return {
    organization,
    nif: b.nif,
    firstname: b.firstname,
    lastname: b.lastname,
    address: b.address,
    province: b.province,
    city: b.city,
    countryIso: b.countryIso || "ES",
    postalCode: b.postalCode,
    phone: b.phone,
    email: b.email,
    notes: `Creado desde pedido PrestaShop #${input.orderId} de Grupo BlueDrone`,
  };
}

/**
 * Full Contasimple step for a paid training order.
 * Idempotency is enforced by the private invoice note BD-IDEMPOTENCY:prestashop-order-{id}.
 */
export async function invoicePaidTrainingOrder(input: TrainingOrderInvoiceInput) {
  const decision = decideBillingCompany(input.billing);
  if (decision.company === "manual_review") {
    throw new TrainingInvoiceError("MANUAL_REVIEW", decision.reason, { decision });
  }

  const company: CompanyKey = decision.company;
  const customerResult = await findOrCreateCustomer(company, customerInput(input));
  const lines = buildInvoiceLines(input, company);
  const idempotencyKey = `prestashop-order-${input.orderId}`;
  const noteParts = [
    `Pedido PrestaShop #${input.orderId}`,
    input.orderReference ? `Ref. ${input.orderReference}` : null,
    input.paymentMethod ? `Pago: ${input.paymentMethod}` : null,
  ].filter(Boolean);

  const invoiceResult = await createIssuedInvoice(company, {
    targetEntityId: customerResult.customer.id,
    lines,
    date: input.paidAt,
    notes: noteParts.join(" | "),
    invoiceClass: 705, // Prestaciones de servicios; matches existing BlueDrone training invoice.
    operationType: "Nacional",
    idempotencyKey,
  });

  const period = getContasimplePeriod(input.paidAt);
  let invoice = await getIssuedInvoice(company, period, invoiceResult.invoice.id);
  let paymentAssigned = false;
  let paymentWarning: string | null = null;

  // Categoría de cobro según el método recibido de PrestaShop. UNMAPPED se
  // intercepta antes en el endpoint (manual_review); aquí es defensivo.
  const paymentCategory = categorizePaymentMethod(input.paymentMethod);
  if (paymentCategory === "UNMAPPED") {
    throw new TrainingInvoiceError(
      "MANUAL_REVIEW",
      `Método de pago no mapeado ("${input.paymentMethod || ""}"). Requiere revisión manual; no se emite ni cobra automáticamente.`,
      { paymentMethod: input.paymentMethod }
    );
  }

  // REGLA DE SEGURIDAD (todas las categorías): una factura SOLO se marca como
  // cobrada cuando el pago se ha confirmado realmente en PrestaShop, es decir
  // payment_accepted === true || paid === true (ambos llegan consolidados en
  // input.paymentAccepted desde el endpoint). NUNCA se infiere que está cobrada
  // por el hecho de que order.payment sea PayPal, Redsys o Tarjeta. order.payment
  // y order.payment_module solo eligen el método de cobro de Contasimple.
  const paymentConfirmed = input.paymentAccepted === true;
  const shouldMarkPaid =
    input.markPaid !== false &&
    (paymentCategory === "TPV_REDSYS" ||
      paymentCategory === "PAYPAL" ||
      paymentCategory === "TRANSFERENCIA") &&
    paymentConfirmed;

  if (shouldMarkPaid && String(invoice.status).toLowerCase() !== "payed") {
    const paidAlready = money(invoice.totalPayedAmount || 0);
    const remaining = money(invoice.totalAmount - paidAlready);
    if (remaining > 0.009) {
      // Nunca Efectivo, nunca Transferencia para pagos Redsys/PayPal: se resuelve
      // estrictamente por categoría dentro de la sociedad emisora.
      const method = await findTrainingPaymentMethod(company, paymentCategory);
      if (!method) {
        paymentWarning =
          `Factura creada, pero ${company} no tiene configurado en Contasimple un método de cobro equivalente a ${paymentCategory} (recibido: "${input.paymentMethod || ""}"). No se ha marcado como pagada automáticamente.`;
      } else {
        await assignInvoicePayment(company, period, invoice.id, remaining, input.paidAt, method.id);
        paymentAssigned = true;
        invoice = await getIssuedInvoice(company, period, invoice.id);
      }
    }
  } else if (
    !paymentConfirmed &&
    input.markPaid !== false &&
    String(invoice.status).toLowerCase() !== "payed"
  ) {
    paymentWarning =
      paymentCategory === "TRANSFERENCIA"
        ? `Factura creada por TRANSFERENCIA bancaria pendiente de cobro. No se marca como pagada hasta confirmar la recepción del pago en PrestaShop (payment_accepted/paid).`
        : `Factura creada (${paymentCategory}) pero el pago no está confirmado (payment_accepted/paid no son true). No se marca como pagada hasta confirmar la recepción del pago en PrestaShop.`;
  }

  return {
    success: true,
    company,
    billingReason: decision.reason,
    customer: {
      id: customerResult.customer.id,
      organization: customerResult.customer.organization,
      nif: customerResult.customer.nif,
      created: customerResult.created,
    },
    invoice: {
      id: invoice.id,
      number: invoice.number,
      period,
      status: invoice.status,
      totalAmount: invoice.totalAmount,
      created: invoiceResult.created,
    },
    paymentAssigned,
    paymentWarning,
    paymentCategory,
    idempotencyKey,
  };
}
