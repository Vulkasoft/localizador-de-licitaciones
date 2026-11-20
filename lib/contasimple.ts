/**
 * Contasimple API Client
 * Handles authentication and data fetching from Contasimple API v2
 * Supports two companies: Península and Canarias via separate API keys
 */

const API_URL = process.env.CONTASIMPLE_API_URL || "https://api.contasimple.com/api/v2";

export type CompanyKey = "peninsula" | "canarias";

function getAuthKey(company: CompanyKey): string {
  if (company === "peninsula") {
    return process.env.CONTASIMPLE_AUTH_KEY_PENINSULA || "";
  }
  return process.env.CONTASIMPLE_AUTH_KEY_CANARIAS || process.env.CONTASIMPLE_AUTH_KEY || "";
}

// Separate token cache per company
const tokenCache: Record<CompanyKey, { token: string; expiresAt: number } | null> = {
  peninsula: null,
  canarias: null,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * fetch wrapper that retries transient failures. Contasimple intermittently
 * returns a 500/502/503/504 with an HTML error page or a 429 rate-limit; those
 * are transient, so we retry with exponential backoff instead of failing the
 * whole sync. Network/abort errors are retried too. 4xx (other than 429) are
 * returned immediately since retrying will not help.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 3,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok || (res.status < 500 && res.status !== 429)) {
        return res;
      }
      // transient server error / rate limit
      lastErr = new Error(`HTTP ${res.status}`);
      if (attempt < retries) {
        await sleep(Math.min(1000 * 2 ** attempt, 8000));
        continue;
      }
      return res; // out of retries: let caller read the body and throw
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await sleep(Math.min(1000 * 2 ** attempt, 8000));
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Contasimple request failed");
}

export interface ContasimpleCustomer {
  id: number;
  companyId: number;
  type: string;
  organization: string;
  name: string | null;
  firstname: string | null;
  lastname: string | null;
  nif: string;
  address: string;
  province: string;
  city: string;
  country: string;
  countryId: number;
  postalCode: string;
  phone: string;
  mobile: string;
  fax: string;
  email: string;
  notes: string;
  url: string;
  customField1: string;
  customField2: string;
}

export interface ContasimpleEstimateLine {
  id: number;
  concept: string;
  quantity: number;
  unitTaxableAmount: number;
  vatPercentage: number;
  vatAmount: number;
  totalTaxableAmount: number;
  discountPercentage: number;
  detailedDescription: string;
  productId: number | null;
  productName: string | null;
  productSku: string | null;
}

export interface ContasimpleEstimate {
  id: number;
  type: string;
  number: string;
  notes: string;
  presupuestoDate: string;
  issueDate: string;
  expirationDate: string | null;
  creationDate: string | null;
  lastUpdateDate: string;
  status: string;
  entityString: string;
  totalTaxableAmount: number;
  totalVatAmount: number;
  totalAmount: number;
  retentionAmount: number;
  retentionPercentage: number;
  footer: string | null;
  issuer: {
    id: number;
    organization: string;
    nif: string;
    address: string;
    province: string;
    city: string;
    country: string;
    postalCode: string;
    phone: string;
    email: string;
  };
  target: {
    id: number;
    organization: string;
    nif: string;
    address: string;
    province: string;
    city: string;
    country: string;
    postalCode: string;
    phone: string;
    email: string;
  };
  lines: ContasimpleEstimateLine[];
  numberingFormatId: number;
}

interface ContasimpleListResponse<T> {
  count: number;
  totalCount: number;
  data: T[];
}

async function getAccessToken(company: CompanyKey): Promise<string> {
  const cached = tokenCache[company];
  if (cached && cached.expiresAt > Date.now() + 60000) {
    return cached.token;
  }

  const authKey = getAuthKey(company);
  if (!authKey) {
    throw new Error(`Clave API de Contasimple no configurada para ${company === "peninsula" ? "Península" : "Canarias"}`);
  }

  const res = await fetchWithRetry(`${API_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=authentication_key&key=${authKey}`,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Contasimple auth failed for ${company} (${res.status}): ${text}`);
  }

  const data = await res.json();
  tokenCache[company] = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return data.access_token;
}

async function apiGet<T>(company: CompanyKey, path: string, params?: Record<string, string>): Promise<T> {
  const token = await getAccessToken(company);
  const url = new URL(`${API_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetchWithRetry(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Accept-Language": "es-ES",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Contasimple API error (${res.status}): ${text.slice(0, 300)}`);
  }

  return res.json();
}

/**
 * Contasimple paginates lists with startIndex (0-based offset) + numRows (page size).
 * NOTE: the API silently ignores `page`/`pageSize`, always returning the first page.
 */
function pageParams(page: number, pageSize: number): Record<string, string> {
  const p = Math.max(1, page);
  return { startIndex: String((p - 1) * pageSize), numRows: String(pageSize) };
}

/**
 * Fetch all customers from Contasimple (paginated, fetches all pages)
 */
export async function fetchAllCustomers(company: CompanyKey): Promise<ContasimpleCustomer[]> {
  const pageSize = 300;
  let page = 1;
  const allCustomers: ContasimpleCustomer[] = [];

  while (true) {
    const result = await apiGet<ContasimpleListResponse<ContasimpleCustomer>>(
      company,
      "/entities/customers",
      pageParams(page, pageSize)
    );
    allCustomers.push(...result.data);

    // NOTE: `totalCount` from Contasimple is unreliable (for some endpoints it
    // returns the current page count, not the real total), so we stop ONLY when
    // a page comes back with fewer rows than requested (i.e. the last page).
    if (result.data.length < pageSize) break;
    page++;
    if (page > 500) break; // hard safety cap
  }

  return allCustomers;
}

/**
 * Fetch all estimates (presupuestos) from Contasimple (paginated)
 */
export async function fetchAllEstimates(company: CompanyKey): Promise<ContasimpleEstimate[]> {
  const pageSize = 300;
  let page = 1;
  const allEstimates: ContasimpleEstimate[] = [];

  while (true) {
    const result = await apiGet<ContasimpleListResponse<ContasimpleEstimate>>(
      company,
      "/accounting/estimates",
      pageParams(page, pageSize)
    );
    allEstimates.push(...result.data);

    // NOTE: `totalCount` from Contasimple is unreliable for estimates (it returns
    // the current page count, not the real total), so we stop ONLY when a page
    // comes back with fewer rows than requested (i.e. the last page).
    if (result.data.length < pageSize) break;
    page++;
    if (page > 500) break; // hard safety cap
  }

  return allEstimates;
}

/**
 * Fetch customers with pagination support for UI
 */
export async function fetchCustomers(
  company: CompanyKey,
  page: number = 1,
  pageSize: number = 50
): Promise<ContasimpleListResponse<ContasimpleCustomer>> {
  return apiGet<ContasimpleListResponse<ContasimpleCustomer>>(
    company,
    "/entities/customers",
    pageParams(page, pageSize)
  );
}

/**
 * Fetch estimates with pagination support for UI
 */
export async function fetchEstimates(
  company: CompanyKey,
  page: number = 1,
  pageSize: number = 50
): Promise<ContasimpleListResponse<ContasimpleEstimate>> {
  return apiGet<ContasimpleListResponse<ContasimpleEstimate>>(
    company,
    "/accounting/estimates",
    pageParams(page, pageSize)
  );
}

/**
 * Get company info (active company + all companies)
 */
export async function getCompanyInfo(company: CompanyKey) {
  const token = await getAccessToken(company);

  const meRes = await fetch(`${API_URL}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!meRes.ok) {
    throw new Error("Error al obtener datos de Contasimple");
  }

  const meData = await meRes.json();
  const companyData = meData.data.company;
  const fiscalRegion = companyData.fiscalRegion || {};

  return {
    id: companyData.id,
    name: companyData.organizationName,
    nif: companyData.nif,
    email: companyData.email,
    region: fiscalRegion.name || "Sin región",
  };
}

// ============================================================
// WRITE SUPPORT: products search, customers search, numbering,
// estimate creation (used by the app and the external agent)
// ============================================================

export interface ContasimpleProduct {
  id: number;
  name: string;
  price: number;
  vat: number;
  description: string | null;
  internalCode: string | null;
  externalReference: string | null;
  currentStock: number | null;
  active: boolean;
}

export interface EstimateLineInput {
  concept: string;
  quantity: number;
  unitAmount: number;
  vatPercentage: number;
  discountPercentage?: number;
  detailedDescription?: string | null;
  productId?: number | null;
  productName?: string | null;
  productSku?: string | null;
}

async function apiRequest<T>(
  company: CompanyKey,
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const token = await getAccessToken(company);
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Accept-Language": "es-ES",
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Contasimple API error (${res.status}): ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined as T;
  }
}

/** Search products in the Contasimple catalog */
export async function searchProducts(company: CompanyKey, query: string): Promise<ContasimpleProduct[]> {
  const result = await apiGet<{ data: ContasimpleProduct[] }>(company, "/products/search", {
    query,
    includeInactive: "false",
  });
  return result.data ?? [];
}

/** List all products (first pages) */
export async function listProducts(company: CompanyKey, page = 1, pageSize = 100): Promise<{ data: ContasimpleProduct[]; totalCount: number }> {
  const result = await apiGet<{ data: ContasimpleProduct[]; totalCount: number }>(company, "/products", pageParams(page, pageSize));
  return { data: result.data ?? [], totalCount: result.totalCount ?? 0 };
}

/** Search customers by name/text */
export async function searchCustomers(company: CompanyKey, query: string): Promise<ContasimpleCustomer[]> {
  const result = await apiGet<{ data: ContasimpleCustomer[] }>(company, "/entities/customers/search", {
    query,
  });
  return result.data ?? [];
}

interface NumberingFormat {
  id: number;
  name: string | null;
  format: string | null;
  isDefault: boolean;
  isActive: boolean;
}

/** Get the default estimate numbering format id */
export async function getDefaultEstimateNumberingFormat(company: CompanyKey): Promise<NumberingFormat> {
  const result = await apiGet<{ data: NumberingFormat[] }>(company, "/configuration/numberingFormats/estimates");
  const formats = result.data ?? [];
  const def = formats.find((f) => f.isDefault && f.isActive) || formats.find((f) => f.isActive) || formats[0];
  if (!def) throw new Error("No hay formatos de numeración de presupuestos configurados en Contasimple");
  return def;
}

/** Get the next estimate number for a numbering format */
export async function getNextEstimateNumber(company: CompanyKey, numberingFormatId: number): Promise<string> {
  const result = await apiGet<{ data: { number?: string; nextNumber?: string } | string }>(
    company,
    `/accounting/estimates/nextEstimateNumber/${numberingFormatId}`
  );
  const d: any = result.data;
  if (typeof d === "string") return d;
  return d?.number ?? d?.nextNumber ?? String(d);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Create a real estimate (presupuesto) in Contasimple.
 * Computes vatAmount/totalTaxableAmount per line automatically.
 * Returns the created estimate.
 */
export async function createEstimate(
  company: CompanyKey,
  input: {
    targetEntityId: number;
    lines: EstimateLineInput[];
    notes?: string | null;
    expirationDate?: string | null;
    date?: string | null;
  }
): Promise<ContasimpleEstimate> {
  const numberingFormat = await getDefaultEstimateNumberingFormat(company);
  const number = await getNextEstimateNumber(company, numberingFormat.id);

  const lines = input.lines.map((l) => {
    const discount = l.discountPercentage ?? 0;
    const totalTaxable = round2(l.quantity * l.unitAmount * (1 - discount / 100));
    const vatAmount = round2((totalTaxable * l.vatPercentage) / 100);
    return {
      concept: l.concept,
      unitAmount: round2(l.unitAmount),
      quantity: l.quantity,
      vatPercentage: l.vatPercentage,
      vatAmount,
      totalTaxableAmount: totalTaxable,
      discountPercentage: discount,
      detailedDescription: l.detailedDescription ?? undefined,
      productId: l.productId ?? undefined,
      productName: l.productName ?? undefined,
      productSku: l.productSku ?? undefined,
    };
  });

  const payload = {
    targetEntityId: input.targetEntityId,
    numberingFormatId: numberingFormat.id,
    number,
    status: "Creado",
    date: input.date ?? new Date().toISOString().slice(0, 10),
    expirationDate: input.expirationDate ?? undefined,
    notes: input.notes ?? undefined,
    lines,
  };

  const result = await apiRequest<{ data: ContasimpleEstimate }>(company, "POST", "/accounting/estimates", payload);
  return (result as any).data ?? (result as unknown as ContasimpleEstimate);
}

/** Delete an estimate in Contasimple (used for tests/corrections) */
export async function deleteEstimate(company: CompanyKey, estimateId: number): Promise<void> {
  await apiRequest(company, "DELETE", `/accounting/estimates/${estimateId}`);
}

// ============================================================
// EXTENDED WRITE/READ SUPPORT (verified live against Contasimple API):
//  - estimate detail (with lines), estimate PDF download
//  - estimate update (PUT)
//  - customer create / update / delete
// ============================================================

/** Get the full detail of an estimate, including its lines/products. */
export async function getEstimateDetail(company: CompanyKey, estimateId: number): Promise<ContasimpleEstimate> {
  const result = await apiGet<{ data: ContasimpleEstimate }>(company, `/accounting/estimates/${estimateId}`);
  return (result as any).data ?? (result as unknown as ContasimpleEstimate);
}

/** Download the PDF of an estimate. Returns the raw bytes. */
export async function getEstimatePdf(company: CompanyKey, estimateId: number): Promise<Buffer> {
  const token = await getAccessToken(company);
  const res = await fetch(`${API_URL}/accounting/estimates/${estimateId}/pdf`, {
    headers: { Authorization: `Bearer ${token}`, "Accept-Language": "es-ES" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Contasimple PDF error (${res.status}): ${text}`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

/**
 * Update an existing estimate in Contasimple. Recomputes line totals.
 * Dates must be sent as full datetime (yyyy-MM-ddTHH:mm:ss) or the API rejects them.
 */
export async function updateEstimate(
  company: CompanyKey,
  estimateId: number,
  input: {
    targetEntityId: number;
    numberingFormatId: number;
    number: string;
    status?: string | null;
    lines: EstimateLineInput[];
    notes?: string | null;
    date?: string | null;
    expirationDate?: string | null;
  }
): Promise<ContasimpleEstimate> {
  const toDateTime = (d?: string | null): string => {
    if (!d) return new Date().toISOString().slice(0, 10) + "T00:00:00";
    // Accept both "yyyy-MM-dd" and full ISO strings
    return String(d).slice(0, 10) + "T00:00:00";
  };

  const lines = input.lines.map((l) => {
    const discount = l.discountPercentage ?? 0;
    const totalTaxable = round2(l.quantity * l.unitAmount * (1 - discount / 100));
    const vatAmount = round2((totalTaxable * l.vatPercentage) / 100);
    return {
      concept: l.concept,
      unitAmount: round2(l.unitAmount),
      quantity: l.quantity,
      vatPercentage: l.vatPercentage,
      vatAmount,
      totalTaxableAmount: totalTaxable,
      discountPercentage: discount,
      detailedDescription: l.detailedDescription ?? undefined,
      productId: l.productId ?? undefined,
      productName: l.productName ?? undefined,
      productSku: l.productSku ?? undefined,
    };
  });

  const dt = toDateTime(input.date);
  const payload = {
    id: estimateId,
    targetEntityId: input.targetEntityId,
    numberingFormatId: input.numberingFormatId,
    number: input.number,
    status: input.status ?? "Creado",
    date: dt,
    presupuestoDate: dt,
    issueDate: dt,
    expirationDate: input.expirationDate ? toDateTime(input.expirationDate) : null,
    notes: input.notes ?? null,
    lines,
  };

  const result = await apiRequest<{ data: ContasimpleEstimate }>(company, "PUT", `/accounting/estimates/${estimateId}`, payload);
  return (result as any).data ?? (result as unknown as ContasimpleEstimate);
}

export interface CustomerWriteInput {
  organization: string;
  nif?: string | null;
  address?: string | null;
  province?: string | null;
  city?: string | null;
  country?: string | null;
  countryId?: number | null;
  postalCode?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  notes?: string | null;
  url?: string | null;
}

function buildCustomerPayload(input: CustomerWriteInput): Record<string, unknown> {
  return {
    type: "Target",
    organization: input.organization,
    name: null,
    firstname: null,
    lastname: null,
    nif: input.nif ?? "",
    address: input.address ?? "",
    province: input.province ?? "",
    city: input.city ?? "",
    country: input.country ?? "España",
    countryId: input.countryId ?? 1,
    postalCode: input.postalCode ?? "",
    phone: input.phone ?? "",
    mobile: input.mobile ?? "",
    fax: "",
    email: input.email ?? "",
    notes: input.notes ?? "",
    url: input.url ?? "",
    customField1: "",
    customField2: "",
  };
}

/** Create a customer (entity) in Contasimple. Returns the created customer. */
export async function createCustomer(company: CompanyKey, input: CustomerWriteInput): Promise<ContasimpleCustomer> {
  const result = await apiRequest<{ data: ContasimpleCustomer }>(company, "POST", "/entities/customers", buildCustomerPayload(input));
  return (result as any).data ?? (result as unknown as ContasimpleCustomer);
}

/** Update a customer (entity) in Contasimple. */
export async function updateCustomer(company: CompanyKey, customerId: number, input: CustomerWriteInput): Promise<ContasimpleCustomer> {
  const payload = { ...buildCustomerPayload(input), id: customerId };
  const result = await apiRequest<{ data: ContasimpleCustomer }>(company, "PUT", `/entities/customers/${customerId}`, payload);
  return (result as any).data ?? (result as unknown as ContasimpleCustomer);
}

/** Delete a customer (entity) in Contasimple. */
export async function deleteCustomer(company: CompanyKey, customerId: number): Promise<void> {
  await apiRequest(company, "DELETE", `/entities/customers/${customerId}`);
}

/** Numbering format id + next number for a company (needed to update estimates). */
export async function getEstimateNumberingContext(company: CompanyKey): Promise<{ numberingFormatId: number }> {
  const fmt = await getDefaultEstimateNumberingFormat(company);
  return { numberingFormatId: fmt.id };
}

// ============================================================
// INVOICES (read-only): reflect real issued invoices linked to an estimate.
// We only READ invoices — we never create/delete fiscal invoices from the app.
// ============================================================

export interface ContasimpleInvoice {
  id: number;
  number?: string | null;
  invoiceDate?: string | null;
  status?: string | null;
  period?: string | null;
  totalAmount?: number | null;
  totalTaxableAmount?: number | null;
  totalVatAmount?: number | null;
  entityString?: string | null;
  relatedEstimateId?: number | null;
}

/**
 * Fetch the issued invoices linked to a given estimate.
 * Returns an empty array when the estimate has not been invoiced yet.
 */
export async function fetchRelatedInvoicesForEstimate(
  company: CompanyKey,
  estimateId: number,
): Promise<ContasimpleInvoice[]> {
  const result = await apiGet<any>(company, `/accounting/estimates/${estimateId}/relatedInvoices`);
  const arr = Array.isArray(result) ? result : (result?.data ?? []);
  return Array.isArray(arr) ? (arr as ContasimpleInvoice[]) : [];
}


// ============================================================
// BLUEDRONE TRAINING INVOICING (added by patch 2026-10-05)
// ISSUED INVOICES / CUSTOMERS / PAYMENTS
// Used by the BlueDrone training checkout automation.
// ============================================================

export interface ContasimpleCustomerInput {
  organization: string;
  nif: string;
  firstname?: string | null;
  lastname?: string | null;
  address?: string | null;
  province?: string | null;
  city?: string | null;
  countryIso?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

export interface IssuedInvoiceLineInput {
  concept: string;
  quantity: number;
  unitAmount: number;
  vatPercentage: number;
  discountPercentage?: number;
  detailedDescription?: string | null;
}

export interface ContasimpleIssuedInvoice {
  id: number;
  period: string;
  type: string;
  number: string;
  notes: string | null;
  invoiceDate: string;
  status: string;
  entityString: string;
  originalTargetEntityID?: number | null;
  totalTaxableAmount: number;
  totalVatAmount: number;
  totalAmount: number;
  totalPayedAmount?: number;
  invoiceClass: number;
  operationType?: string | null;
  numberingFormatId?: number | null;
  lines?: Array<{
    id?: number;
    concept: string;
    quantity: number;
    unitTaxableAmount?: number;
    vatPercentage: number;
    vatAmount: number;
    totalTaxableAmount: number;
    discountPercentage: number;
    detailedDescription?: string | null;
  }>;
}

export interface ContasimplePaymentMethod {
  id: number;
  type: string;
  name: string;
  number?: string | null;
  active: boolean;
  isDefault: boolean;
}

interface ContasimpleCountry {
  id: number;
  name: string;
  isoCodeAlpha2: string;
  isoCodeAlpha3: string;
}

function normalizeNif(value: string): string {
  return value.toUpperCase().replace(/[\s.-]/g, "");
}

/** Fiscal period required by Contasimple, e.g. 2026-4T. */
export function getContasimplePeriod(date: string | Date = new Date()): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) throw new Error("Fecha no válida para calcular el periodo fiscal de Contasimple");
  const quarter = Math.ceil((d.getMonth() + 1) / 3);
  return `${d.getFullYear()}-${quarter}T`;
}

/** Look up a country in Contasimple by ISO-2 code. */
export async function getCountryByIso(company: CompanyKey, isoCode: string): Promise<ContasimpleCountry> {
  const iso = (isoCode || "ES").trim().toUpperCase();
  const result = await apiGet<{ data: ContasimpleCountry[] }>(company, "/configuration/countries");
  const country = (result.data ?? []).find((c) => c.isoCodeAlpha2?.toUpperCase() === iso);
  if (!country) throw new Error(`País ${iso} no encontrado en la configuración de Contasimple`);
  return country;
}

/** Exact customer lookup by fiscal identifier, used for invoice idempotency. */
export async function findCustomerByNif(company: CompanyKey, nif: string): Promise<ContasimpleCustomer | null> {
  const wanted = normalizeNif(nif);
  if (!wanted) return null;
  const matches = await searchCustomers(company, nif);
  return matches.find((c) => normalizeNif(c.nif || "") === wanted) ?? null;
}

/** Create a real target customer in Contasimple. */
export async function createTargetCustomer(
  company: CompanyKey,
  input: ContasimpleCustomerInput
): Promise<ContasimpleCustomer> {
  if (!input.organization?.trim()) throw new Error("El cliente necesita nombre/razón social");
  if (!input.nif?.trim()) throw new Error("El cliente necesita NIF/CIF/NIE");

  const country = await getCountryByIso(company, input.countryIso || "ES");
  const payload = {
    type: "Target",
    organization: input.organization.trim(),
    firstname: input.firstname?.trim() || undefined,
    lastname: input.lastname?.trim() || undefined,
    nif: input.nif.trim().toUpperCase(),
    address: input.address?.trim() || "",
    province: input.province?.trim() || "",
    city: input.city?.trim() || "",
    country: country.name,
    countryId: country.id,
    postalCode: input.postalCode?.trim() || "",
    phone: input.phone?.trim() || "",
    fax: "",
    email: input.email?.trim() || "",
    notes: input.notes?.trim() || "Creado automáticamente desde Grupo BlueDrone",
    url: "",
    customField1: "",
    customField2: "",
  };

  const result = await apiRequest<{ data: ContasimpleCustomer }>(company, "POST", "/entities/customers", payload);
  return (result as any).data ?? (result as unknown as ContasimpleCustomer);
}

/** Find existing customer by NIF or create it. */
export async function findOrCreateCustomer(
  company: CompanyKey,
  input: ContasimpleCustomerInput
): Promise<{ customer: ContasimpleCustomer; created: boolean }> {
  const existing = await findCustomerByNif(company, input.nif);
  if (existing) return { customer: existing, created: false };
  return { customer: await createTargetCustomer(company, input), created: true };
}

function getConfiguredInvoiceFormatId(company: CompanyKey): number | null {
  const raw =
    company === "canarias"
      ? process.env.CONTASIMPLE_INVOICE_FORMAT_ID_CANARIAS
      : process.env.CONTASIMPLE_INVOICE_FORMAT_ID_PENINSULA;
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Selects the normal issued-invoice numbering series.
 * Production defaults are inferred from the currently configured BlueDrone series,
 * but an explicit env id always takes precedence.
 */
export async function getInvoiceNumberingFormat(company: CompanyKey): Promise<NumberingFormat> {
  const result = await apiGet<{ data: NumberingFormat[] }>(company, "/configuration/numberingFormats/invoices");
  const formats = (result.data ?? []).filter((f) => f.isActive !== false);
  if (!formats.length) throw new Error("No hay series activas de facturación en Contasimple");

  const configured = getConfiguredInvoiceFormatId(company);
  if (configured) {
    const exact = formats.find((f) => f.id === configured);
    if (!exact) throw new Error(`La serie de facturación configurada (${configured}) no existe o no está activa en ${company}`);
    return exact;
  }

  const normal = formats.filter((f: any) => {
    const name = (f.name || "").toLowerCase();
    const mask = String((f as any).mask || (f as any).format || "").toLowerCase();
    return !name.includes("rectific") && !mask.startsWith("r-");
  });

  if (company === "canarias") {
    const preferred =
      normal.find((f: any) => (f.name || "").toLowerCase().includes("canarias")) ||
      normal.find((f: any) => String(f.mask || f.format || "").toUpperCase().startsWith("FC-"));
    if (preferred) return preferred;
  } else {
    const preferred =
      normal.find((f: any) => (f.name || "").toLowerCase().includes("grupo bluedrone")) ||
      normal.find((f: any) => String(f.mask || f.format || "").toUpperCase().includes("-B"));
    if (preferred) return preferred;
  }

  if (normal.length === 1) return normal[0];
  const def = normal.find((f) => f.isDefault);
  if (def) return def;
  throw new Error(`No se puede determinar de forma segura la serie normal de facturación de ${company}; configura CONTASIMPLE_INVOICE_FORMAT_ID_${company.toUpperCase()}`);
}

/** Get next invoice number from Contasimple for the exact fiscal period and series. */
export async function getNextInvoiceNumber(
  company: CompanyKey,
  period: string,
  numberingFormatId: number
): Promise<string> {
  const result = await apiGet<{ data: string | { number?: string; nextNumber?: string } }>(
    company,
    `/accounting/${encodeURIComponent(period)}/invoices/issued/nextInvoiceNumber/${numberingFormatId}`
  );
  const d: any = result.data;
  if (typeof d === "string") return d;
  const number = d?.number ?? d?.nextNumber;
  if (!number) throw new Error("Contasimple no devolvió el siguiente número de factura");
  return String(number);
}

/** Search issued invoices by private notes; used to prevent duplicate billing of the same order. */
export async function findIssuedInvoiceByNotes(
  company: CompanyKey,
  period: string,
  notes: string
): Promise<ContasimpleIssuedInvoice | null> {
  const result = await apiGet<ContasimpleListResponse<ContasimpleIssuedInvoice>>(
    company,
    `/accounting/${encodeURIComponent(period)}/invoices/issued`,
    { startIndex: "0", numRows: "50", notes, sort: "-date" }
  );
  return (result.data ?? [])[0] ?? null;
}

/**
 * Fetch ALL issued invoices for a fiscal period (paginated). Each invoice
 * already includes its `lines`, so no per-invoice detail call is needed.
 */
export async function fetchIssuedInvoices(
  company: CompanyKey,
  period: string
): Promise<ContasimpleIssuedInvoice[]> {
  const pageSize = 300;
  let page = 1;
  const all: ContasimpleIssuedInvoice[] = [];
  while (true) {
    const result = await apiGet<ContasimpleListResponse<ContasimpleIssuedInvoice>>(
      company,
      `/accounting/${encodeURIComponent(period)}/invoices/issued`,
      { ...pageParams(page, pageSize), sort: "-date" }
    );
    const rows = result.data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    page++;
    if (page > 50) break; // hard safety cap
  }
  return all;
}

function getTrainingInvoiceClass(company: CompanyKey): number {
  const raw =
    company === "canarias"
      ? process.env.CONTASIMPLE_TRAINING_INVOICE_CLASS_CANARIAS
      : process.env.CONTASIMPLE_TRAINING_INVOICE_CLASS_PENINSULA;
  const parsed = raw ? Number(raw) : NaN;
  // 705 = Prestaciones de servicios (matches existing BlueDrone training invoices).
  return Number.isFinite(parsed) && parsed >= 700 && parsed < 800 ? parsed : 705;
}

/**
 * Create a real issued invoice.
 * Caller controls tax percentages; do NOT infer IGIC/IVA merely from company.
 * This is important for tax-exempt training products.
 */
export async function createIssuedInvoice(
  company: CompanyKey,
  input: {
    targetEntityId: number;
    lines: IssuedInvoiceLineInput[];
    date?: string | null;
    notes?: string | null;
    footer?: string | null;
    operationType?: string | null;
    invoiceClass?: number | null;
    idempotencyKey?: string | null;
  }
): Promise<{ invoice: ContasimpleIssuedInvoice; created: boolean }> {
  if (!input.targetEntityId || input.targetEntityId < 1) throw new Error("targetEntityId no válido");
  if (!input.lines?.length) throw new Error("La factura necesita al menos una línea");

  const date = input.date ? new Date(input.date) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error("Fecha de factura no válida");
  const period = getContasimplePeriod(date);
  const marker = input.idempotencyKey?.trim() ? `BD-IDEMPOTENCY:${input.idempotencyKey.trim()}` : null;
  const notes = [input.notes?.trim(), marker].filter(Boolean).join(" | ");

  if (marker) {
    const existing = await findIssuedInvoiceByNotes(company, period, marker);
    if (existing) return { invoice: existing, created: false };
  }

  const numberingFormat = await getInvoiceNumberingFormat(company);
  const number = await getNextInvoiceNumber(company, period, numberingFormat.id);

  const lines = input.lines.map((line) => {
    const quantity = Number(line.quantity);
    const unitAmount = round2(Number(line.unitAmount));
    const discount = round2(Number(line.discountPercentage ?? 0));
    const vat = round2(Number(line.vatPercentage));
    if (!Number.isFinite(quantity) || quantity === 0) throw new Error(`Cantidad no válida en línea: ${line.concept}`);
    if (!Number.isFinite(unitAmount)) throw new Error(`Precio no válido en línea: ${line.concept}`);
    if (!Number.isFinite(vat) || vat < 0) throw new Error(`Impuesto no válido en línea: ${line.concept}`);
    if (discount < 0 || discount > 100) throw new Error(`Descuento no válido en línea: ${line.concept}`);

    const totalTaxableAmount = round2(quantity * unitAmount * (1 - discount / 100));
    const vatAmount = round2((totalTaxableAmount * vat) / 100);
    return {
      concept: line.concept,
      unitAmount,
      quantity,
      totalTaxableAmount,
      discountPercentage: discount,
      vatPercentage: vat,
      vatAmount,
      rePercentage: 0,
      reAmount: 0,
      detailedDescription: line.detailedDescription ?? undefined,
    };
  });

  const payload = {
    targetEntityId: input.targetEntityId,
    numberingFormatId: numberingFormat.id,
    number,
    date: date.toISOString(),
    invoiceClass: input.invoiceClass ?? getTrainingInvoiceClass(company),
    notes: notes || undefined,
    footer: input.footer?.trim() || undefined,
    retentionPercentage: 0,
    // Existing BlueDrone training invoices use Nacional even when the line is tax-exempt.
    operationType: input.operationType?.trim() || "Nacional",
    lines,
  };

  const result = await apiRequest<{ data: ContasimpleIssuedInvoice }>(
    company,
    "POST",
    `/accounting/${encodeURIComponent(period)}/invoices/issued`,
    payload
  );
  const invoice = (result as any).data ?? (result as unknown as ContasimpleIssuedInvoice);
  return { invoice, created: true };
}

/** Get a single issued invoice. */
export async function getIssuedInvoice(
  company: CompanyKey,
  period: string,
  invoiceId: number
): Promise<ContasimpleIssuedInvoice> {
  const result = await apiGet<{ data: ContasimpleIssuedInvoice }>(
    company,
    `/accounting/${encodeURIComponent(period)}/invoices/issued/${invoiceId}`
  );
  return (result as any).data ?? (result as unknown as ContasimpleIssuedInvoice);
}

/** Download issued invoice PDF as bytes. */
export async function getIssuedInvoicePdf(
  company: CompanyKey,
  period: string,
  invoiceId: number
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const token = await getAccessToken(company);
  const res = await fetch(
    `${API_URL}/accounting/${encodeURIComponent(period)}/invoices/issued/${invoiceId}/pdf`,
    { headers: { Authorization: `Bearer ${token}`, "Accept-Language": "es-ES" } }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Contasimple PDF error (${res.status}): ${text}`);
  }
  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") || "application/pdf",
  };
}

/** List configured payment methods. */
export async function getPaymentMethods(company: CompanyKey): Promise<ContasimplePaymentMethod[]> {
  const result = await apiGet<{ data: ContasimplePaymentMethod[] }>(company, "/configuration/paymentMethods");
  return (result.data ?? []).filter((p) => p.active !== false);
}

/** Prefer an existing TPV/Redsys/card payment method; no unsafe fallback to cash. */
export async function findCardPaymentMethod(company: CompanyKey): Promise<ContasimplePaymentMethod | null> {
  const methods = await getPaymentMethods(company);
  const byName = methods.find((m) => /redsys|tpv/i.test(m.name || ""));
  if (byName) return byName;
  const byType = methods.find((m) => (m.type || "").toLowerCase() === "tarjeta");
  return byType ?? null;
}

// Categorías de cobro reales de Grupo BlueDrone. Cualquier otro método recibido
// de PrestaShop se considera NO mapeado y debe ir a revisión manual.
export type PaymentCategory = "TPV_REDSYS" | "PAYPAL" | "TRANSFERENCIA" | "UNMAPPED";

/**
 * Traduce el nombre del módulo de pago de PrestaShop (order.payment) a una de
 * las tres categorías reales de BlueDrone. Nunca mapea a "Efectivo". Si no
 * reconoce el método, devuelve "UNMAPPED" (el llamador lo deja en manual_review).
 */
export function categorizePaymentMethod(paymentName: string | null | undefined): PaymentCategory {
  const s = (paymentName || "").toLowerCase().trim();
  if (!s) return "UNMAPPED";
  // PayPal incluye "PayPal" y "PayPal Pay Later" / pago aplazado de PayPal.
  if (/paypal/.test(s)) return "PAYPAL";
  // Redsys / TPV / Tarjeta bancaria.
  if (/redsys|tpv|tarjeta|\bcard\b|credit\s*card/.test(s)) return "TPV_REDSYS";
  // Transferencia bancaria.
  if (/transferenc|transfer|bank\s*wire|\bwire\b/.test(s)) return "TRANSFERENCIA";
  return "UNMAPPED";
}

/**
 * Elige, dentro de la lista de métodos de Contasimple de la sociedad, el que
 * corresponde a la categoría indicada. Reglas estrictas:
 *  - TPV_REDSYS  -> nombre con "redsys"/"tpv" (NO usa el fallback type==tarjeta,
 *                  para no confundir métodos mal configurados tipo "Tarjeta").
 *  - PAYPAL      -> nombre con "paypal".
 *  - TRANSFERENCIA -> nombre con "transferenc", prefiriendo el de tipo real de
 *                  transferencia (Ingreso_Trasferencia) frente a uno mal tipado.
 * Nunca devuelve "Efectivo". Si no existe, devuelve null (no se marca cobrada).
 */
export function resolvePaymentMethodForCategory(
  methods: ContasimplePaymentMethod[],
  category: PaymentCategory
): ContasimplePaymentMethod | null {
  if (category === "UNMAPPED") return null;
  const safe = methods.filter((m) => !/efectivo|cash/i.test(m.name || "") && (m.type || "").toLowerCase() !== "efectivo");
  const byName = (re: RegExp) => safe.filter((m) => re.test(m.name || ""));
  if (category === "TPV_REDSYS") return byName(/redsys|tpv/i)[0] ?? null;
  if (category === "PAYPAL") return byName(/paypal/i)[0] ?? null;
  if (category === "TRANSFERENCIA") {
    const cands = byName(/transferenc/i);
    const proper = cands.find((m) => /trasferenc|transferenc/i.test(m.type || ""));
    return proper ?? cands[0] ?? null;
  }
  return null;
}

/** Busca en Contasimple el método de cobro equivalente a la categoría dada. */
export async function findTrainingPaymentMethod(
  company: CompanyKey,
  category: PaymentCategory
): Promise<ContasimplePaymentMethod | null> {
  if (category === "UNMAPPED") return null;
  const methods = await getPaymentMethods(company);
  return resolvePaymentMethodForCategory(methods, category);
}

/** Mark an issued invoice as paid in Contasimple. */
export async function assignInvoicePayment(
  company: CompanyKey,
  period: string,
  invoiceId: number,
  amount: number,
  date: string | Date,
  paymentMethodId: number
): Promise<any> {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) throw new Error("Fecha de pago no válida");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Importe de pago no válido");
  if (!paymentMethodId || paymentMethodId < 1) throw new Error("Método de pago no válido");
  const payload = { date: d.toISOString(), amount: round2(amount), paymentMethodId };
  const result = await apiRequest<any>(
    company,
    "POST",
    `/accounting/${encodeURIComponent(period)}/invoices/issued/${invoiceId}/payments`,
    payload
  );
  return (result as any).data ?? result;
}
