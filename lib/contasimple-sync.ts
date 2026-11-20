import { prisma } from "@/lib/db";
import {
  CompanyKey,
  ContasimpleCustomer,
  ContasimpleEstimate,
  fetchAllCustomers,
  fetchAllEstimates,
  getEstimateDetail,
  getEstimatePdf,
} from "@/lib/contasimple";
import { uploadBuffer, deleteFile } from "@/lib/s3-files";

/** Normalize a NIF/CIF for comparison: uppercase, strip spaces and dashes. */
export function normalizeNif(nif?: string | null): string {
  return (nif || "").toUpperCase().replace(/[\s-]/g, "").trim();
}

const AUTO_PDF_PREFIX = "Presupuesto Contasimple";

export interface SyncedLine {
  concept: string;
  quantity: number;
  unitAmount: number;
  vatPercentage: number;
  vatAmount: number;
  discountPercentage: number;
  totalTaxableAmount: number;
  detailedDescription: string | null;
  productId: number | null;
  productName: string | null;
  productSku: string | null;
}

/** Map a Contasimple estimate's lines into our structured JSON shape. */
export function mapEstimateLines(estimate: ContasimpleEstimate): SyncedLine[] {
  return (estimate.lines || []).map((l) => ({
    concept: (l.concept || "").trim(),
    quantity: l.quantity,
    unitAmount: l.unitTaxableAmount,
    vatPercentage: l.vatPercentage,
    vatAmount: l.vatAmount,
    discountPercentage: l.discountPercentage ?? 0,
    totalTaxableAmount: l.totalTaxableAmount,
    detailedDescription: l.detailedDescription || null,
    productId: l.productId ?? null,
    productName: l.productName ?? null,
    productSku: l.productSku ?? null,
  }));
}

/**
 * Figure out which sede (company) an estimate belongs to. Tries the hint first,
 * then falls back to probing both sedes. Returns null if not found in either.
 */
export async function resolveCompanyForEstimate(
  estimateId: number,
  hint?: string | null
): Promise<CompanyKey | null> {
  const order: CompanyKey[] =
    hint === "peninsula" ? ["peninsula", "canarias"] : hint === "canarias" ? ["canarias", "peninsula"] : ["peninsula", "canarias"];
  for (const company of order) {
    try {
      const detail = await getEstimateDetail(company, estimateId);
      if (detail && detail.id) return company;
    } catch {
      // try next sede
    }
  }
  return null;
}

export interface SyncResult {
  budgetId: string;
  created: boolean;
  pdfImported: boolean;
}

/**
 * Sync a single Contasimple estimate into a local Budget: structured lines,
 * totals, sede + estado, and the estimate PDF imported into the budget files.
 * Idempotent: upserts by contasimpleId and replaces the auto-imported PDF.
 */
export async function syncEstimateToBudget(
  company: CompanyKey,
  estimateId: number,
  opts?: { userId?: string; estimate?: ContasimpleEstimate; importPdf?: boolean }
): Promise<SyncResult> {
  const estimate = opts?.estimate ?? (await getEstimateDetail(company, estimateId));
  const lines = mapEstimateLines(estimate);

  const provincia = estimate.target?.province || estimate.issuer?.province || null;
  const clienteNombre = estimate.entityString || estimate.target?.organization || null;

  const linesText = lines
    .map((l) => `${l.concept} (x${l.quantity} - ${l.unitAmount.toFixed(2)}€)`)
    .join("\n");
  const description = [
    `Número: ${estimate.number}`,
    `Estado Contasimple: ${estimate.status}`,
    `Base imponible: ${estimate.totalTaxableAmount.toFixed(2)}€`,
    `IVA: ${estimate.totalVatAmount.toFixed(2)}€`,
    `Total: ${estimate.totalAmount.toFixed(2)}€`,
    estimate.retentionAmount > 0
      ? `Retención: ${estimate.retentionAmount.toFixed(2)}€ (${estimate.retentionPercentage}%)`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const budgetData = {
    contasimpleNumber: estimate.number,
    contasimpleCompany: company,
    contasimpleEstado: estimate.status || null,
    cliente: clienteNombre,
    comunidadAutonoma: provincia,
    ciudad: estimate.target?.city || null,
    fechaSolicitud: estimate.presupuestoDate ? new Date(estimate.presupuestoDate) : null,
    fechaPlazo: estimate.expirationDate ? new Date(estimate.expirationDate) : null,
    descripcion: description,
    lineasJson: JSON.stringify(lines),
    baseImponible: estimate.totalTaxableAmount,
    totalIva: estimate.totalVatAmount,
    totalConIva: estimate.totalAmount,
  };

  const existing = await prisma.budget.findUnique({ where: { contasimpleId: estimate.id } });

  let budgetId: string;
  let created = false;
  if (existing) {
    await prisma.budget.update({ where: { contasimpleId: estimate.id }, data: budgetData });
    budgetId = existing.id;
  } else {
    if (!opts?.userId) {
      // Need an owner to create a new budget; pick the oldest admin/user as fallback.
      const owner = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
      if (!owner) throw new Error("No hay usuario disponible para asignar el presupuesto");
      opts = { ...(opts || {}), userId: owner.id };
    }
    const budget = await prisma.budget.create({
      data: {
        ...budgetData,
        userId: opts.userId!,
        contasimpleId: estimate.id,
        nombre: `${estimate.number} - ${clienteNombre ?? ""}`.trim(),
        tipo: "NORMAL",
        estado: "PENDIENTE",
      },
    });
    budgetId = budget.id;
    created = true;
  }

  // Import the estimate PDF into the budget files (replace prior auto PDF).
  let pdfImported = false;
  if (opts?.importPdf !== false) {
    try {
      const pdf = await getEstimatePdf(company, estimate.id);
      const filename = `${AUTO_PDF_PREFIX} ${estimate.number}.pdf`.replace(/\//g, "-");

      const priorAuto = await prisma.budgetFile.findMany({
        where: { budgetId, tipo: "PRESUPUESTO", filename: { startsWith: AUTO_PDF_PREFIX } },
      });
      for (const pf of priorAuto) {
        try {
          await deleteFile(pf.s3Key);
        } catch {
          /* ignore S3 delete errors */
        }
        await prisma.budgetFile.delete({ where: { id: pf.id } });
      }

      const { cloud_storage_path } = await uploadBuffer(filename, pdf, "application/pdf", false);
      await prisma.budgetFile.create({
        data: {
          budgetId,
          filename,
          s3Key: cloud_storage_path,
          tipo: "PRESUPUESTO",
          fileSize: pdf.length,
          isPublic: false,
        },
      });
      pdfImported = true;
    } catch (err) {
      console.error(`No se pudo importar el PDF del presupuesto ${estimate.id}:`, err);
    }
  }

  return { budgetId, created, pdfImported };
}

/**
 * Upsert a single Contasimple customer into the local DB, keyed by this sede's
 * id first, then by NIF, then by legacy contasimpleId. Sets the per-sede id.
 */
export async function upsertCustomerFromContasimple(
  company: CompanyKey,
  customer: ContasimpleCustomer
): Promise<"created" | "updated"> {
  const sedeField: "contasimpleIdPeninsula" | "contasimpleIdCanarias" =
    company === "peninsula" ? "contasimpleIdPeninsula" : "contasimpleIdCanarias";
  const nifNorm = normalizeNif(customer.nif);

  let existing = await prisma.customer.findFirst({ where: { [sedeField]: customer.id } });
  if (!existing && nifNorm) {
    existing = await prisma.customer.findFirst({ where: { nif: customer.nif } });
  }
  if (!existing) {
    existing = await prisma.customer.findFirst({ where: { contasimpleId: customer.id } });
  }

  const incoming = {
    nombre: customer.organization || customer.name || "(sin nombre)",
    nif: customer.nif || null,
    direccion: customer.address || null,
    provincia: customer.province || null,
    ciudad: customer.city || null,
    codigoPostal: customer.postalCode || null,
    pais: customer.country || null,
    telefono: customer.phone || null,
    movil: customer.mobile || null,
    email: customer.email || null,
    notas: customer.notes || null,
    url: customer.url || null,
  };

  if (existing) {
    await prisma.customer.update({
      where: { id: existing.id },
      data: { ...incoming, [sedeField]: customer.id },
    });
    return "updated";
  }
  await prisma.customer.create({ data: { ...incoming, [sedeField]: customer.id } });
  return "created";
}

/** Sync every customer of a sede into the local DB. Returns counts. */
export async function syncAllCustomers(company: CompanyKey): Promise<{ imported: number; updated: number; skipped: number }> {
  const all = await fetchAllCustomers(company);
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  for (const c of all) {
    try {
      const r = await upsertCustomerFromContasimple(company, c);
      if (r === "created") imported++;
      else updated++;
    } catch (err) {
      console.error(`Error sincronizando cliente ${c.id} (${company}):`, err);
      skipped++;
    }
  }
  return { imported, updated, skipped };
}

/** Sync every estimate of a sede into local budgets (structured lines, no PDF). */
export async function syncAllEstimates(company: CompanyKey): Promise<{ imported: number; updated: number; skipped: number }> {
  const all = await fetchAllEstimates(company);
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  for (const e of all) {
    try {
      const r = await syncEstimateToBudget(company, e.id, { estimate: e, importPdf: false });
      if (r.created) imported++;
      else updated++;
    } catch (err) {
      console.error(`Error sincronizando presupuesto ${e.id} (${company}):`, err);
      skipped++;
    }
  }
  return { imported, updated, skipped };
}

// ============================================================
// INVOICE STATUS SYNC (read-only)
// Reflect real issued invoices from Contasimple onto the budget's
// billing fields (facturado / numeroFactura / fechaFactura). We only READ
// invoices from Contasimple; we never create or delete fiscal invoices.
// ============================================================

export interface InvoiceSyncResult {
  synced: boolean;
  reason?: string;
  facturado: boolean;
  numeroFactura: string | null;
  fechaFactura: string | null;
  invoices: number;
}

export async function syncInvoiceStatusForBudget(budgetId: string): Promise<InvoiceSyncResult> {
  const { fetchRelatedInvoicesForEstimate } = await import("@/lib/contasimple");

  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) {
    return { synced: false, reason: "not_found", facturado: false, numeroFactura: null, fechaFactura: null, invoices: 0 };
  }
  if (!budget.contasimpleId) {
    return { synced: false, reason: "not_contasimple", facturado: budget.facturado, numeroFactura: budget.numeroFactura, fechaFactura: budget.fechaFactura ? budget.fechaFactura.toISOString() : null, invoices: 0 };
  }

  let company = (budget.contasimpleCompany as CompanyKey | null) || null;
  if (company !== "peninsula" && company !== "canarias") {
    company = await resolveCompanyForEstimate(budget.contasimpleId, budget.contasimpleCompany);
  }
  if (!company) {
    return { synced: false, reason: "sede_not_found", facturado: budget.facturado, numeroFactura: budget.numeroFactura, fechaFactura: budget.fechaFactura ? budget.fechaFactura.toISOString() : null, invoices: 0 };
  }

  const invoices = await fetchRelatedInvoicesForEstimate(company, budget.contasimpleId);

  if (invoices.length === 0) {
    // No fiscal invoice linked in Contasimple. Do not force-unset a manual flag.
    return { synced: true, facturado: budget.facturado, numeroFactura: budget.numeroFactura, fechaFactura: budget.fechaFactura ? budget.fechaFactura.toISOString() : null, invoices: 0 };
  }

  // Pick the most recent invoice by invoiceDate.
  const sorted = [...invoices].sort((a, b) => {
    const da = a.invoiceDate ? new Date(a.invoiceDate).getTime() : 0;
    const db = b.invoiceDate ? new Date(b.invoiceDate).getTime() : 0;
    return db - da;
  });
  const inv = sorted[0];
  const fecha = inv.invoiceDate ? new Date(inv.invoiceDate) : null;

  const updated = await prisma.budget.update({
    where: { id: budgetId },
    data: {
      facturado: true,
      numeroFactura: inv.number ?? budget.numeroFactura,
      fechaFactura: fecha ?? budget.fechaFactura,
      contasimpleCompany: company,
    },
  });

  return {
    synced: true,
    facturado: updated.facturado,
    numeroFactura: updated.numeroFactura,
    fechaFactura: updated.fechaFactura ? updated.fechaFactura.toISOString() : null,
    invoices: invoices.length,
  };
}
