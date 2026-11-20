import { prisma } from "@/lib/db";
import {
  CompanyKey,
  ContasimpleEstimate,
  EstimateLineInput,
  createEstimate,
  searchCustomers,
} from "@/lib/contasimple";

export interface EstimateLineDraft extends Omit<EstimateLineInput, "vatPercentage" | "quantity" | "unitAmount" | "discountPercentage"> {
  vatPercentage?: number | null;
  quantity?: number | null;
  unitAmount?: number | null;
  discountPercentage?: number | null;
}

export interface CreateEstimateRequest {
  company: CompanyKey;
  /** Contasimple customer/entity id. If missing, clienteNombre is used to search. */
  targetEntityId?: number | null;
  /** Customer name or NIF to search in Contasimple when targetEntityId is not provided */
  clienteNombre?: string | null;
  lines: EstimateLineDraft[];
  notes?: string | null;
  expirationDate?: string | null;
  /** Extra metadata for the local budget record */
  nombre?: string | null;
  comunidadAutonoma?: string | null;
  ciudad?: string | null;
  descripcion?: string | null;
  fechaPlazo?: string | null;
  /** Optional tender to link the mirrored local budget to */
  tenderId?: string | null;
}

export interface CreateEstimateResult {
  estimate: ContasimpleEstimate;
  localBudgetId: string;
  matchedCustomer: { id: number; organization: string; nif: string } | null;
}

export class EstimateCreationError extends Error {
  candidates?: { id: number; organization: string; nif: string }[];
  constructor(message: string, candidates?: { id: number; organization: string; nif: string }[]) {
    super(message);
    this.candidates = candidates;
  }
}

const DEFAULT_VAT: Record<CompanyKey, number> = { peninsula: 21, canarias: 7 };

/**
 * Creates a real estimate in Contasimple and mirrors it as a local Budget
 * in GestionDJI (estado PENDIENTE) for human review.
 */
export async function createEstimateWithLocalBudget(
  input: CreateEstimateRequest,
  userId: string,
  createdBy: string
): Promise<CreateEstimateResult> {
  const company = input.company;

  if (!input.lines?.length) {
    throw new EstimateCreationError("El presupuesto debe tener al menos una línea");
  }

  // Resolve target customer
  let targetEntityId = input.targetEntityId ?? null;
  let matchedCustomer: CreateEstimateResult["matchedCustomer"] = null;

  if (!targetEntityId) {
    const query = (input.clienteNombre || "").trim();
    if (!query) {
      throw new EstimateCreationError("Debes indicar targetEntityId o clienteNombre para identificar al cliente");
    }
    const results = await searchCustomers(company, query);
    if (results.length === 0) {
      throw new EstimateCreationError(
        `No se encontró ningún cliente en Contasimple (${company}) que coincida con "${query}". Usa la herramienta de búsqueda de clientes o crea el cliente primero en Contasimple.`
      );
    }
    if (results.length > 1) {
      const exact = results.filter(
        (c) => (c.organization || "").toLowerCase() === query.toLowerCase() || (c.nif || "").toLowerCase() === query.toLowerCase()
      );
      if (exact.length === 1) {
        targetEntityId = exact[0].id;
        matchedCustomer = { id: exact[0].id, organization: exact[0].organization, nif: exact[0].nif };
      } else {
        throw new EstimateCreationError(
          `Hay ${results.length} clientes que coinciden con "${query}". Indica el targetEntityId exacto.`,
          results.slice(0, 10).map((c) => ({ id: c.id, organization: c.organization, nif: c.nif }))
        );
      }
    } else {
      targetEntityId = results[0].id;
      matchedCustomer = { id: results[0].id, organization: results[0].organization, nif: results[0].nif };
    }
  }

  // Normalize lines (apply default VAT by fiscal region if not provided)
  const lines: EstimateLineInput[] = input.lines.map((l) => ({
    ...l,
    vatPercentage: l.vatPercentage ?? DEFAULT_VAT[company],
    quantity: l.quantity ?? 1,
    unitAmount: l.unitAmount ?? 0,
    discountPercentage: l.discountPercentage ?? undefined,
  }));

  const estimate = await createEstimate(company, {
    targetEntityId: targetEntityId!,
    lines,
    notes: input.notes ?? undefined,
    expirationDate: input.expirationDate ?? undefined,
  });

  // Mirror as local budget for review
  const clienteFinal = matchedCustomer?.organization || estimate?.target?.organization || input.clienteNombre || null;
  const budget = await prisma.budget.create({
    data: {
      userId,
      tenderId: input.tenderId ?? undefined,
      contasimpleId: estimate?.id ?? undefined,
      contasimpleNumber: estimate?.number ?? undefined,
      nombre: input.nombre || `Presupuesto ${estimate?.number ?? ""} - ${clienteFinal ?? ""}`.trim(),
      cliente: clienteFinal,
      comunidadAutonoma: input.comunidadAutonoma ?? (company === "canarias" ? "Canarias" : null),
      ciudad: input.ciudad ?? null,
      tipo: "LICITACION",
      estado: "PENDIENTE",
      fechaSolicitud: new Date(),
      fechaPlazo: input.fechaPlazo ? new Date(input.fechaPlazo) : null,
      descripcion: input.descripcion ?? null,
      notas: `Creado automáticamente en Contasimple (${company === "canarias" ? "Canarias" : "Península"}) con número ${estimate?.number ?? "?"}. Pendiente de valoración de precios.`,
    },
  });

  await prisma.auditLog.create({
    data: {
      budgetId: budget.id,
      userId,
      accion: "CREATE",
      detalles: `Presupuesto real creado en Contasimple por ${createdBy}: ${estimate?.number ?? "?"} (${lines.length} líneas)`,
    },
  });

  return { estimate, localBudgetId: budget.id, matchedCustomer };
}
