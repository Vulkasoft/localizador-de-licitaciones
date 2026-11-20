import { google, drive_v3 } from "googleapis";
import { Readable } from "stream";
import { CompanyKey, getIssuedInvoicePdf } from "@/lib/contasimple";

/**
 * Google Drive integration for BlueDrone training enrollment files (expedientes).
 *
 * Folder structure (under the shared root folder = "ALUMNOS"):
 *   <root ALUMNOS> / <año> / <curso> / <student_code - Nombre Apellidos>
 * Inside each student folder:
 *   01 - Matricula.pdf
 *   02 - Factura <numero>.pdf
 *   03 - Comprobante pago Redsys.pdf
 *   04 - Documentacion   (empty subfolder)
 *
 * Hard rules:
 *  - Credentials ONLY from env vars (GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON). Never hardcode.
 *  - Search before creating folders (no duplicates) using student_code as the stable id.
 *  - Search before uploading files (no duplicates).
 *  - The same invoice PDF can be stored in every student's expediente of a multi-student order.
 *  - Recoverable errors: if Contasimple finished but Drive fails, the caller must NOT recreate
 *    the invoice (idempotency is enforced in Contasimple); Drive can be retried safely.
 */

const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"];
const FOLDER_MIME = "application/vnd.google-apps.folder";

export class DriveError extends Error {
  code: string;
  recoverable: boolean;
  details?: any;
  constructor(code: string, message: string, recoverable = true, details?: any) {
    super(message);
    this.name = "DriveError";
    this.code = code;
    this.recoverable = recoverable;
    this.details = details;
  }
}

export interface TrainingDriveConfig {
  configured: boolean;
  missing: string[];
  serviceAccountEmail: string | null;
  rootFolderId: string | null;
  error?: string;
}

/**
 * Read and validate Drive configuration strictly from env vars.
 * Does NOT touch the network.
 */
export function getTrainingDriveConfig(): TrainingDriveConfig {
  const missing: string[] = [];
  const rawJson = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || "";
  const rootFolderId = (process.env.BLUEDRONE_DRIVE_ROOT_FOLDER_ID || "").trim();

  if (!rawJson.trim()) missing.push("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON");
  if (!rootFolderId) missing.push("BLUEDRONE_DRIVE_ROOT_FOLDER_ID");

  let serviceAccountEmail: string | null = null;
  let error: string | undefined;

  if (rawJson.trim()) {
    try {
      const creds = JSON.parse(rawJson);
      serviceAccountEmail = creds.client_email || null;
      if (!creds.client_email || !creds.private_key) {
        error = "El JSON de la cuenta de servicio no contiene client_email y/o private_key";
      }
    } catch {
      error = "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON no es un JSON válido";
    }
  }

  return {
    configured: missing.length === 0 && !error,
    missing,
    serviceAccountEmail,
    rootFolderId: rootFolderId || null,
    error,
  };
}

/** Build an authenticated Drive client from the service-account JSON env var. */
function getDriveClient(): drive_v3.Drive {
  const rawJson = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || "";
  if (!rawJson.trim()) {
    throw new DriveError("DRIVE_NOT_CONFIGURED", "Falta GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON", false);
  }
  let creds: any;
  try {
    creds = JSON.parse(rawJson);
  } catch {
    throw new DriveError("DRIVE_BAD_CREDENTIALS", "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON no es un JSON válido", false);
  }
  if (!creds.client_email || !creds.private_key) {
    throw new DriveError("DRIVE_BAD_CREDENTIALS", "El JSON de la cuenta de servicio es incompleto", false);
  }
  // Optional domain-wide delegation: if GOOGLE_DRIVE_IMPERSONATE_USER is set and
  // delegation is authorized in Google Workspace, created items are owned by that
  // real user (which has storage quota). When unset, behaviour is unchanged.
  const impersonate = (process.env.GOOGLE_DRIVE_IMPERSONATE_USER || "").trim();
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: DRIVE_SCOPES,
    ...(impersonate ? { subject: impersonate } : {}),
  });
  return google.drive({ version: "v3", auth });
}

/** Sanitize a folder/file name so it is safe and stable on Drive. */
export function sanitizeDriveName(name: string, fallback = "SIN NOMBRE"): string {
  const cleaned = String(name || "")
    .normalize("NFC")
    // forbidden / problematic path characters
    .replace(/[\\/:*?"<>|]/g, "-")
    // control chars
    .replace(/[\u0000-\u001f\u007f]/g, "")
    // collapse whitespace
    .replace(/\s+/g, " ")
    .trim()
    // strip leading/trailing dots and dashes
    .replace(/^[.\-\s]+|[.\-\s]+$/g, "")
    .trim();
  const result = cleaned.slice(0, 180).trim();
  return result || fallback;
}

/** Escape a value for use inside a Drive query string literal. */
function escapeQuery(value: string): string {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findChild(
  drive: drive_v3.Drive,
  parentId: string,
  opts: { name?: string; nameContains?: string; isFolder: boolean }
): Promise<drive_v3.Schema$File | null> {
  const clauses = [`'${escapeQuery(parentId)}' in parents`, "trashed = false"];
  if (opts.isFolder) clauses.push(`mimeType = '${FOLDER_MIME}'`);
  else clauses.push(`mimeType != '${FOLDER_MIME}'`);
  if (opts.name) clauses.push(`name = '${escapeQuery(opts.name)}'`);
  if (opts.nameContains) clauses.push(`name contains '${escapeQuery(opts.nameContains)}'`);

  const res = await drive.files.list({
    q: clauses.join(" and "),
    fields: "files(id, name, webViewLink, mimeType)",
    pageSize: 50,
    spaces: "drive",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const files = res.data.files || [];
  return files[0] || null;
}

/** Find a folder by exact name under a parent, or create it. */
async function ensureFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string
): Promise<drive_v3.Schema$File> {
  const existing = await findChild(drive, parentId, { name, isFolder: true });
  if (existing) return existing;
  const res = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: "id, name, webViewLink",
    supportsAllDrives: true,
  });
  return res.data;
}

/**
 * Find the student folder using student_code as the stable id (even if the display
 * name changed), or create it with the canonical name.
 */
async function ensureStudentFolder(
  drive: drive_v3.Drive,
  parentId: string,
  studentCode: string,
  folderName: string
): Promise<drive_v3.Schema$File> {
  // Search by the stable student_code prefix.
  const byCode = await findChild(drive, parentId, { nameContains: studentCode, isFolder: true });
  if (byCode) return byCode;
  // Fallback: exact canonical name (in case student_code is not embedded).
  const byName = await findChild(drive, parentId, { name: folderName, isFolder: true });
  if (byName) return byName;
  const res = await drive.files.create({
    requestBody: { name: folderName, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: "id, name, webViewLink",
    supportsAllDrives: true,
  });
  return res.data;
}

/** Upload a file if a file with the same name does not already exist in the folder. */
async function ensureFile(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
  bytes: Uint8Array,
  mimeType: string
): Promise<string> {
  const existing = await findChild(drive, parentId, { name, isFolder: false });
  if (existing?.id) return existing.id;
  const res = await drive.files.create({
    requestBody: { name, parents: [parentId] },
    media: { mimeType: mimeType || "application/pdf", body: Readable.from(Buffer.from(bytes)) },
    fields: "id, name",
    supportsAllDrives: true,
  });
  return res.data.id || "";
}

export interface TrainingDriveStudentInput {
  enrollmentId: number;
  studentCode: string;
  courseName: string;
  firstName: string;
  lastName: string;
  matriculaPdf?: { filename: string; mime: string; base64: string } | null;
  paymentReceiptPdf?: { filename: string; mime: string; base64: string } | null;
}

export interface TrainingDriveInput {
  year: string;
  company: CompanyKey;
  period: string;
  invoiceId: number;
  invoiceNumber: string;
  students: TrainingDriveStudentInput[];
}

export interface TrainingDriveStudentResult {
  enrollment_id: number;
  student_code: string;
  folder_id: string;
  folder_url: string;
  matricula_file_id: string;
  invoice_file_id: string;
  payment_receipt_file_id: string;
}

/** Build the canonical student folder name: "<student_code> - Nombre Apellidos". */
function studentFolderName(s: TrainingDriveStudentInput): string {
  const fullName = [s.firstName, s.lastName].filter(Boolean).join(" ").trim();
  const raw = fullName ? `${s.studentCode} - ${fullName}` : s.studentCode;
  return sanitizeDriveName(raw, s.studentCode || "ALUMNO");
}

/** The invoice file name used inside each expediente. */
function invoiceFileName(invoiceNumber: string): string {
  const num = sanitizeDriveName(invoiceNumber || "", "");
  return num ? `02 - Factura ${num}.pdf` : "02 - Factura.pdf";
}

const MATRICULA_FILE = "01 - Matricula.pdf";
const RECEIPT_FILE = "03 - Comprobante pago Redsys.pdf";
const DOCS_FOLDER = "04 - Documentacion";

/* ------------------------------------------------------------------ *
 * HISTORICAL BLUEDRONE STRUCTURE (Grupo BlueDrone expedientes)        *
 *                                                                     *
 * Rules:                                                              *
 *  - Year 2026 orders:   RAIZ / MES / Nombre Apellidos                *
 *  - Year >= 2027:       RAIZ / AÑO / MES / Nombre Apellidos          *
 *  - Month/year come from the PAYMENT CONFIRMATION date.              *
 *  - Files inside the student folder:                                 *
 *      Matrícula - Nombre Apellidos.pdf                               *
 *      Factura - Nombre Apellidos.pdf                                 *
 *      Justificante de pago - Nombre Apellidos.pdf                    *
 *  - Idempotent, and the real drive_folder_id is persisted so the     *
 *    expediente is found even if the display name changes.            *
 *  - Name collision (same full name, same month): the first keeps the *
 *    plain name; the second uses "Nombre Apellidos - ALU-AAAA-NNNNNN".*
 * ------------------------------------------------------------------ */

const SPANISH_MONTHS = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

/** Parse a payment date (ISO string, timestamp or Date) into a Date. */
export function parsePaymentDate(input: string | number | Date): Date {
  if (input instanceof Date) return input;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** The full student display name "Nombre Apellidos" (sanitized). */
export function studentDisplayName(firstName: string, lastName: string): string {
  const full = [firstName, lastName].filter(Boolean).join(" ").trim();
  return sanitizeDriveName(full, "ALUMNO");
}

/** The three file names stored inside a student expediente (historical scheme). */
export function historicalStudentFileNames(displayName: string) {
  const name = sanitizeDriveName(displayName, "ALUMNO");
  return {
    matricula: `Matrícula - ${name}.pdf`,
    factura: `Factura - ${name}.pdf`,
    justificante: `Justificante de pago - ${name}.pdf`,
  };
}

export interface HistoricalDrivePath {
  year: number;
  month: string;
  /** Folder segments under the root, EXCLUDING the student folder. */
  parentSegments: string[];
  /** Folder segments under the root, INCLUDING the student folder. */
  segments: string[];
  /** Human-readable path "RAIZ / ... / Nombre Apellidos". */
  path: string;
  studentFolderName: string;
  files: string[];
}

/**
 * Compute the historical BlueDrone folder path for a given payment date and
 * student name. PURE: no network, creates nothing.
 *   2026        -> RAIZ / MES / Nombre Apellidos
 *   2027 and up -> RAIZ / AÑO / MES / Nombre Apellidos
 */
export function buildHistoricalDrivePath(
  paymentDate: string | number | Date,
  firstName: string,
  lastName: string,
  rootLabel = "RAIZ"
): HistoricalDrivePath {
  const d = parsePaymentDate(paymentDate);
  const year = d.getFullYear();
  const month = SPANISH_MONTHS[d.getMonth()];
  const displayName = studentDisplayName(firstName, lastName);

  const parentSegments = year <= 2026 ? [month] : [String(year), month];
  const segments = [...parentSegments, displayName];
  const files = historicalStudentFileNames(displayName);

  return {
    year,
    month,
    parentSegments,
    segments,
    path: [rootLabel, ...segments].join(" / "),
    studentFolderName: displayName,
    files: [files.matricula, files.factura, files.justificante],
  };
}

/**
 * READ-ONLY preview of the historical structure. Verifies the configured root
 * is reachable and reports, for each sample (payment date + name), the exact
 * path that WOULD be used and which parent folders already exist. Creates
 * NOTHING (no folders, no files).
 */
export async function readOnlyHistoricalDrivePreview(
  samples: { label: string; paymentDate: string; firstName: string; lastName: string }[]
) {
  const config = getTrainingDriveConfig();
  const rootId = config.rootFolderId || "";

  let rootName: string | null = null;
  let rootReadable = false;
  let rootError: string | null = null;
  let drive: drive_v3.Drive | null = null;

  if (config.configured && rootId) {
    try {
      drive = getDriveClient();
      const meta = await drive.files.get({
        fileId: rootId,
        fields: "id, name, driveId, capabilities(canAddChildren)",
        supportsAllDrives: true,
      });
      rootName = meta.data.name || null;
      rootReadable = true;
    } catch (e: any) {
      rootError = e?.message || String(e);
    }
  }

  const rootLabel = rootName || "RAIZ";
  const results = [] as any[];

  for (const s of samples) {
    const p = buildHistoricalDrivePath(s.paymentDate, s.firstName, s.lastName, rootLabel);

    // Walk the parent segments read-only to report which already exist.
    const existing: { name: string; exists: boolean; id: string | null }[] = [];
    let parentId: string | null = rootReadable ? rootId : null;
    for (const seg of p.segments) {
      if (parentId && drive) {
        const found = await findChild(drive, parentId, { name: seg, isFolder: true });
        existing.push({ name: seg, exists: !!found, id: found?.id || null });
        parentId = found?.id || null;
      } else {
        existing.push({ name: seg, exists: false, id: null });
        parentId = null;
      }
    }

    results.push({
      label: s.label,
      payment_date: s.paymentDate,
      student: p.studentFolderName,
      year: p.year,
      month: p.month,
      path: p.path,
      segments: p.segments,
      files: p.files,
      existing_segments: existing,
    });
  }

  return {
    mode: "READ_ONLY",
    created_anything: false,
    service_account_email: config.serviceAccountEmail,
    root_folder_id: rootId || null,
    root_folder_name: rootName,
    root_readable: rootReadable,
    root_error: rootError,
    missing_env: config.missing,
    samples: results,
  };
}

/**
 * DRY-RUN: validate configuration and return a preview of the structure that
 * WOULD be created. Performs NO network calls and creates nothing.
 */
export function previewTrainingDrive(input: TrainingDriveInput) {
  const config = getTrainingDriveConfig();
  const students = input.students.map((s) => {
    const course = sanitizeDriveName(s.courseName, "CURSO");
    const folderName = studentFolderName(s);
    const basePath = ["ALUMNOS", input.year, course, folderName].join(" / ");
    const files: string[] = [];
    if (s.matriculaPdf) files.push(MATRICULA_FILE);
    files.push(invoiceFileName(input.invoiceNumber));
    if (s.paymentReceiptPdf) files.push(RECEIPT_FILE);
    return {
      enrollment_id: s.enrollmentId,
      student_code: s.studentCode,
      folder_path: basePath,
      folders: [`${basePath} / ${DOCS_FOLDER}`],
      files,
    };
  });

  return {
    status: config.configured ? "PREVIEW" : "PENDING_CONFIG",
    service_account_email: config.serviceAccountEmail,
    root_folder_id: config.rootFolderId,
    missing_env: config.missing,
    config_error: config.error || null,
    students,
  };
}

/* ------------------------------------------------------------------ *
 * DRIVE-ONLY TEST (controlled write, NO Contasimple)                  *
 * ------------------------------------------------------------------ */

const TEST_YEAR_FOLDER = "2026";
const TEST_PARENT_FOLDER = "_PRUEBAS_AUTOMATIZACION";
const TEST_STUDENT_FOLDER = "ALU-TEST-000001 - Alumno Prueba";
const TEST_INVOICE_FILE = "02 - Factura TEST.pdf";

/** Build a minimal, valid single-page PDF marked clearly as a test document. */
function buildTestPdf(title: string): Uint8Array {
  const esc = (s: string) => s.replace(/[()\\]/g, (c) => "\\" + c);
  const textLines = [
    "DOCUMENTO DE PRUEBA - SIN VALIDEZ",
    title,
    "Generado automaticamente para la prueba de Google Drive.",
    "Expediente ficticio: " + TEST_STUDENT_FOLDER,
  ];
  const content =
    "BT\n/F1 16 Tf\n72 720 Td\n20 TL\n" +
    textLines.map((l) => `(${esc(l)}) Tj\nT*`).join("\n") +
    "\nET";

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objects.push(
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"
  );
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push(
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`
  );

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.forEach((off) => {
    pdf += String(off).padStart(10, "0") + " 00000 n \n";
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

export interface DriveTestResult {
  status: string;
  folder_id: string;
  folder_url: string;
  matricula_file_id: string;
  invoice_file_id: string;
  payment_receipt_file_id: string;
  documentation_folder_id: string;
  created: {
    year_folder: boolean;
    pruebas_folder: boolean;
    student_folder: boolean;
    documentation_folder: boolean;
    matricula_file: boolean;
    invoice_file: boolean;
    payment_receipt_file: boolean;
  };
  contasimple_writes: number;
}

/**
 * CONTROLLED DRIVE-ONLY TEST. Creates a fictitious test expediente under
 * ALUMNOS / 2026 / _PRUEBAS_AUTOMATIZACION / ALU-TEST-000001 - Alumno Prueba
 * with three minimal test PDFs and the 04 - Documentacion subfolder.
 *
 * - Fully idempotent: every folder and file is searched before being created.
 * - Touches ONLY Google Drive. It NEVER calls Contasimple (no customers,
 *   no invoices, no payments). contasimple_writes is always 0.
 */
export async function writeDriveTestExpediente(): Promise<DriveTestResult> {
  const config = getTrainingDriveConfig();
  if (!config.configured) {
    throw new DriveError(
      "DRIVE_NOT_CONFIGURED",
      `Configuración de Google Drive incompleta: ${[config.error, ...config.missing].filter(Boolean).join(", ")}`,
      true,
      { missing: config.missing }
    );
  }

  const drive = getDriveClient();
  const rootId = config.rootFolderId as string;

  async function ensureFolderTracked(
    parentId: string,
    name: string
  ): Promise<{ file: drive_v3.Schema$File; created: boolean }> {
    const existing = await findChild(drive, parentId, { name, isFolder: true });
    if (existing) return { file: existing, created: false };
    const res = await drive.files.create({
      requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
      fields: "id, name, webViewLink",
      supportsAllDrives: true,
    });
    return { file: res.data, created: true };
  }

  async function ensureFileTracked(
    parentId: string,
    name: string,
    bytes: Uint8Array
  ): Promise<{ id: string; created: boolean }> {
    const existing = await findChild(drive, parentId, { name, isFolder: false });
    if (existing?.id) return { id: existing.id, created: false };
    const res = await drive.files.create({
      requestBody: { name, parents: [parentId] },
      media: { mimeType: "application/pdf", body: Readable.from(Buffer.from(bytes)) },
      fields: "id, name",
      supportsAllDrives: true,
    });
    return { id: res.data.id || "", created: true };
  }

  const year = await ensureFolderTracked(rootId, TEST_YEAR_FOLDER);
  const pruebas = await ensureFolderTracked(year.file.id as string, TEST_PARENT_FOLDER);
  const student = await ensureFolderTracked(pruebas.file.id as string, TEST_STUDENT_FOLDER);
  const studentId = student.file.id as string;
  const docs = await ensureFolderTracked(studentId, DOCS_FOLDER);

  const matricula = await ensureFileTracked(studentId, MATRICULA_FILE, buildTestPdf("01 - Matricula"));
  const invoice = await ensureFileTracked(studentId, TEST_INVOICE_FILE, buildTestPdf("02 - Factura TEST"));
  const receipt = await ensureFileTracked(studentId, RECEIPT_FILE, buildTestPdf("03 - Comprobante pago Redsys"));

  return {
    status: "OK",
    folder_id: studentId,
    folder_url:
      (student.file.webViewLink as string) || `https://drive.google.com/drive/folders/${studentId}`,
    matricula_file_id: matricula.id,
    invoice_file_id: invoice.id,
    payment_receipt_file_id: receipt.id,
    documentation_folder_id: docs.file.id as string,
    created: {
      year_folder: year.created,
      pruebas_folder: pruebas.created,
      student_folder: student.created,
      documentation_folder: docs.created,
      matricula_file: matricula.created,
      invoice_file: invoice.created,
      payment_receipt_file: receipt.created,
    },
    contasimple_writes: 0,
  };
}

/* ------------------------------------------------------------------ *
 * HISTORICAL-STRUCTURE DRIVE-ONLY TEST (controlled write)             *
 *                                                                     *
 * Writes a fictitious expediente using the REAL historical scheme:    *
 *   <root> / OCTUBRE / Alumno Prueba Automatizacion                   *
 * (payment date 2026-10-06 -> year 2026 -> RAIZ / MES / Alumno).      *
 * Inside: Matrícula / Factura / Justificante de pago (test PDFs).     *
 * Fully idempotent. Touches ONLY Drive, NEVER Contasimple.            *
 * ------------------------------------------------------------------ */

/** Build a minimal valid PDF marked as a test document, with a custom label. */
function buildHistoricalTestPdf(title: string, expedienteLabel: string): Uint8Array {
  const esc = (s: string) => s.replace(/[()\\]/g, (c) => "\\" + c);
  const textLines = [
    "DOCUMENTO DE PRUEBA - SIN VALIDEZ",
    title,
    "Generado automaticamente para la prueba de Google Drive.",
    "Expediente ficticio: " + expedienteLabel,
  ];
  const content =
    "BT\n/F1 16 Tf\n72 720 Td\n20 TL\n" +
    textLines.map((l) => `(${esc(l)}) Tj\nT*`).join("\n") +
    "\nET";

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objects.push(
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"
  );
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push(
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`
  );

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.forEach((off) => {
    pdf += String(off).padStart(10, "0") + " 00000 n \n";
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

/** Count how many non-trashed children with an exact name exist under a parent. */
async function countChildren(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
  isFolder: boolean
): Promise<number> {
  const clauses = [
    `'${escapeQuery(parentId)}' in parents`,
    "trashed = false",
    isFolder ? `mimeType = '${FOLDER_MIME}'` : `mimeType != '${FOLDER_MIME}'`,
    `name = '${escapeQuery(name)}'`,
  ];
  const res = await drive.files.list({
    q: clauses.join(" and "),
    fields: "files(id, name)",
    pageSize: 100,
    spaces: "drive",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return (res.data.files || []).length;
}

export interface HistoricalDriveTestResult {
  status: string;
  payment_date: string;
  path: string;
  root: { id: string; name: string };
  month_folder: { id: string; url: string; name: string; created: boolean };
  student_folder: { id: string; url: string; name: string; created: boolean };
  files: {
    matricula: { name: string; id: string; created: boolean };
    factura: { name: string; id: string; created: boolean };
    justificante: { name: string; id: string; created: boolean };
  };
  verification: {
    student_folders_with_name: number;
    matricula_count: number;
    factura_count: number;
    justificante_count: number;
  };
  contasimple_writes: number;
}

/**
 * CONTROLLED historical-structure write test. Creates (idempotently) a fictitious
 * expediente under <root>/OCTUBRE/Alumno Prueba Automatizacion with three minimal
 * test PDFs named per the historical scheme. Returns created/reused flags for every
 * element plus verification counts (to prove no duplicates are produced on reruns).
 * Touches ONLY Google Drive; contasimple_writes is always 0.
 */
export async function writeHistoricalDriveTest(
  paymentDate: string = "2026-10-06",
  firstName: string = "Alumno Prueba Automatización",
  lastName: string = ""
): Promise<HistoricalDriveTestResult> {
  const config = getTrainingDriveConfig();
  if (!config.configured) {
    throw new DriveError(
      "DRIVE_NOT_CONFIGURED",
      `Configuración de Google Drive incompleta: ${[config.error, ...config.missing].filter(Boolean).join(", ")}`,
      true,
      { missing: config.missing }
    );
  }

  const drive = getDriveClient();
  const rootId = config.rootFolderId as string;
  const rootMeta = await drive.files.get({
    fileId: rootId,
    fields: "id, name",
    supportsAllDrives: true,
  });

  const plan = buildHistoricalDrivePath(paymentDate, firstName, lastName, rootMeta.data.name || "RAIZ");
  const displayName = plan.studentFolderName;
  const fileNames = historicalStudentFileNames(displayName);

  async function ensureFolderTracked(
    parentId: string,
    name: string
  ): Promise<{ file: drive_v3.Schema$File; created: boolean }> {
    const existing = await findChild(drive, parentId, { name, isFolder: true });
    if (existing) return { file: existing, created: false };
    const res = await drive.files.create({
      requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
      fields: "id, name, webViewLink",
      supportsAllDrives: true,
    });
    return { file: res.data, created: true };
  }

  async function ensureFileTracked(
    parentId: string,
    name: string,
    bytes: Uint8Array
  ): Promise<{ id: string; created: boolean }> {
    const existing = await findChild(drive, parentId, { name, isFolder: false });
    if (existing?.id) return { id: existing.id, created: false };
    const res = await drive.files.create({
      requestBody: { name, parents: [parentId] },
      media: { mimeType: "application/pdf", body: Readable.from(Buffer.from(bytes)) },
      fields: "id, name",
      supportsAllDrives: true,
    });
    return { id: res.data.id || "", created: true };
  }

  // Walk the parent segments (OCTUBRE, or AÑO/MES for >=2027); keep the last one.
  let parentId = rootId;
  let monthFolder: { file: drive_v3.Schema$File; created: boolean } = {
    file: { id: rootId, name: rootMeta.data.name },
    created: false,
  };
  for (const segment of plan.parentSegments) {
    monthFolder = await ensureFolderTracked(parentId, segment);
    parentId = monthFolder.file.id as string;
  }
  const monthId = parentId;

  const student = await ensureFolderTracked(monthId, displayName);
  const studentId = student.file.id as string;

  const matricula = await ensureFileTracked(
    studentId,
    fileNames.matricula,
    buildHistoricalTestPdf(fileNames.matricula, `${plan.path}`)
  );
  const factura = await ensureFileTracked(
    studentId,
    fileNames.factura,
    buildHistoricalTestPdf(fileNames.factura, `${plan.path}`)
  );
  const justificante = await ensureFileTracked(
    studentId,
    fileNames.justificante,
    buildHistoricalTestPdf(fileNames.justificante, `${plan.path}`)
  );

  // Verification: count duplicates after the operation.
  const student_folders_with_name = await countChildren(drive, monthId, displayName, true);
  const matricula_count = await countChildren(drive, studentId, fileNames.matricula, false);
  const factura_count = await countChildren(drive, studentId, fileNames.factura, false);
  const justificante_count = await countChildren(drive, studentId, fileNames.justificante, false);

  return {
    status: "OK",
    payment_date: paymentDate,
    path: plan.path,
    root: { id: rootId, name: (rootMeta.data.name as string) || "" },
    month_folder: {
      id: monthId,
      url: (monthFolder.file.webViewLink as string) || `https://drive.google.com/drive/folders/${monthId}`,
      name: (monthFolder.file.name as string) || plan.parentSegments[plan.parentSegments.length - 1] || "",
      created: monthFolder.created,
    },
    student_folder: {
      id: studentId,
      url: (student.file.webViewLink as string) || `https://drive.google.com/drive/folders/${studentId}`,
      name: displayName,
      created: student.created,
    },
    files: {
      matricula: { name: fileNames.matricula, id: matricula.id, created: matricula.created },
      factura: { name: fileNames.factura, id: factura.id, created: factura.created },
      justificante: { name: fileNames.justificante, id: justificante.id, created: justificante.created },
    },
    verification: {
      student_folders_with_name,
      matricula_count,
      factura_count,
      justificante_count,
    },
    contasimple_writes: 0,
  };
}

/**
 * REAL upload: create the folder tree and upload the available PDFs for every
 * student, idempotently (search before create / search before upload).
 * The invoice PDF is downloaded once from Contasimple and reused for all students.
 */
export async function uploadTrainingFilesToDrive(
  input: TrainingDriveInput
): Promise<{ status: string; students: TrainingDriveStudentResult[] }> {
  const config = getTrainingDriveConfig();
  if (!config.configured) {
    throw new DriveError(
      "DRIVE_NOT_CONFIGURED",
      `Configuración de Google Drive incompleta: ${[config.error, ...config.missing].filter(Boolean).join(", ")}`,
      true,
      { missing: config.missing }
    );
  }

  const drive = getDriveClient();
  const rootId = config.rootFolderId as string;

  // Download the invoice PDF once (shared across all students of this order).
  let invoiceBytes: Uint8Array | null = null;
  let invoiceMime = "application/pdf";
  try {
    const pdf = await getIssuedInvoicePdf(input.company, input.period, input.invoiceId);
    invoiceBytes = pdf.bytes;
    invoiceMime = pdf.contentType || "application/pdf";
  } catch (e: any) {
    throw new DriveError(
      "INVOICE_PDF_DOWNLOAD_FAILED",
      `No se pudo descargar el PDF de la factura desde Contasimple: ${e?.message || e}`,
      true
    );
  }

  const yearFolder = await ensureFolder(drive, rootId, sanitizeDriveName(input.year, "SIN AÑO"));
  const results: TrainingDriveStudentResult[] = [];

  for (const s of input.students) {
    const courseFolder = await ensureFolder(drive, yearFolder.id as string, sanitizeDriveName(s.courseName, "CURSO"));
    const studentFolder = await ensureStudentFolder(
      drive,
      courseFolder.id as string,
      s.studentCode,
      studentFolderName(s)
    );
    const studentFolderId = studentFolder.id as string;

    // 04 - Documentacion subfolder (empty, created if missing).
    await ensureFolder(drive, studentFolderId, DOCS_FOLDER);

    let matriculaFileId = "";
    if (s.matriculaPdf?.base64) {
      matriculaFileId = await ensureFile(
        drive,
        studentFolderId,
        MATRICULA_FILE,
        new Uint8Array(Buffer.from(s.matriculaPdf.base64, "base64")),
        s.matriculaPdf.mime || "application/pdf"
      );
    }

    const invoiceFileId = invoiceBytes
      ? await ensureFile(drive, studentFolderId, invoiceFileName(input.invoiceNumber), invoiceBytes, invoiceMime)
      : "";

    let receiptFileId = "";
    if (s.paymentReceiptPdf?.base64) {
      receiptFileId = await ensureFile(
        drive,
        studentFolderId,
        RECEIPT_FILE,
        new Uint8Array(Buffer.from(s.paymentReceiptPdf.base64, "base64")),
        s.paymentReceiptPdf.mime || "application/pdf"
      );
    }

    results.push({
      enrollment_id: s.enrollmentId,
      student_code: s.studentCode,
      folder_id: studentFolderId,
      folder_url: (studentFolder.webViewLink as string) || `https://drive.google.com/drive/folders/${studentFolderId}`,
      matricula_file_id: matriculaFileId,
      invoice_file_id: invoiceFileId,
      payment_receipt_file_id: receiptFileId,
    });
  }

  return { status: "OK", students: results };
}

/* ------------------------------------------------------------------ *
 * PRODUCTION HISTORICAL EXPEDIENTES (real webhook write)              *
 *                                                                     *
 * Writes the real student expedientes for a paid training order using *
 * the definitive historical scheme, classified by payment date:       *
 *   2026        -> <root> / MES / Nombre Apellidos                     *
 *   2027 and up -> <root> / AÑO / MES / Nombre Apellidos              *
 * Inside each student folder (historical file names):                 *
 *   Matrícula - Nombre Apellidos.pdf                                   *
 *   Factura - Nombre Apellidos.pdf                                     *
 *   Justificante de pago - Nombre Apellidos.pdf                        *
 *                                                                     *
 * Rules:                                                               *
 *  - Fully idempotent: search-before-create everywhere.               *
 *  - student_code is the STABLE id, stored as Drive appProperties so   *
 *    the expediente is found even if the display name changes and so   *
 *    name collisions (same name, same month) are resolved safely.     *
 *  - The same factura + justificante bytes can be reused across every  *
 *    student of a multi-student order.                                 *
 *  - Touches ONLY Google Drive. Never Contasimple.                    *
 * ------------------------------------------------------------------ */

export interface HistoricalExpedientePdf {
  filename?: string | null;
  mime?: string | null;
  base64: string;
}

export interface HistoricalExpedienteStudentInput {
  enrollmentId: number;
  studentCode: string;
  firstName: string;
  lastName: string;
  courseName?: string | null;
  matriculaPdf?: HistoricalExpedientePdf | null;
  justificantePdf?: HistoricalExpedientePdf | null;
}

export interface HistoricalExpedienteInput {
  /** Payment confirmation date: decides year/month classification. */
  paymentDate: string | number | Date;
  /** Shared factura PDF (same bytes stored in every student's expediente). */
  facturaPdf?: HistoricalExpedientePdf | null;
  students: HistoricalExpedienteStudentInput[];
}

export interface HistoricalExpedienteStudentResult {
  enrollment_id: number;
  student_code: string;
  display_name: string;
  path: string;
  folder_id: string;
  folder_url: string;
  matricula_file_id: string;
  factura_file_id: string;
  justificante_file_id: string;
  /** True when an existing placeholder "Factura - ....pdf" was replaced in place by the real invoice (same fileId/name, no duplicate). */
  factura_replaced: boolean;
  created: { folder: boolean; matricula: boolean; factura: boolean; justificante: boolean };
  verification: {
    student_folders_with_code: number;
    matricula_count: number;
    factura_count: number;
    justificante_count: number;
  };
}

export interface HistoricalExpedienteResult {
  status: string;
  payment_date: string;
  root: { id: string; name: string };
  year: number;
  month: string;
  students: HistoricalExpedienteStudentResult[];
  contasimple_writes: number;
}

/** Decode a base64 PDF payload into bytes. */
function decodePdfBase64(pdf: HistoricalExpedientePdf): Uint8Array {
  return new Uint8Array(Buffer.from(pdf.base64, "base64"));
}

export async function writeHistoricalExpedientes(
  input: HistoricalExpedienteInput
): Promise<HistoricalExpedienteResult> {
  const config = getTrainingDriveConfig();
  if (!config.configured) {
    throw new DriveError(
      "DRIVE_NOT_CONFIGURED",
      `Configuración de Google Drive incompleta: ${[config.error, ...config.missing].filter(Boolean).join(", ")}`,
      true,
      { missing: config.missing }
    );
  }
  if (!input.students || input.students.length === 0) {
    throw new DriveError("DRIVE_NO_STUDENTS", "No hay alumnos en el pedido para crear expedientes", false);
  }

  const drive = getDriveClient();
  const rootId = config.rootFolderId as string;
  const rootMeta = await drive.files.get({
    fileId: rootId,
    fields: "id, name",
    supportsAllDrives: true,
  });
  const rootName = (rootMeta.data.name as string) || "RAIZ";

  const payDate = parsePaymentDate(input.paymentDate);
  const year = payDate.getFullYear();
  const month = SPANISH_MONTHS[payDate.getMonth()];
  // Parent segments shared by all students of this order.
  const parentSegments = year <= 2026 ? [month] : [String(year), month];

  // --- inline idempotent helpers ---
  async function ensureFolderTracked(
    parentId: string,
    name: string
  ): Promise<{ file: drive_v3.Schema$File; created: boolean }> {
    const existing = await findChild(drive, parentId, { name, isFolder: true });
    if (existing) return { file: existing, created: false };
    const res = await drive.files.create({
      requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
      fields: "id, name, webViewLink",
      supportsAllDrives: true,
    });
    return { file: res.data, created: true };
  }

  async function ensureFileTracked(
    parentId: string,
    name: string,
    bytes: Uint8Array,
    mime: string
  ): Promise<{ id: string; created: boolean }> {
    const existing = await findChild(drive, parentId, { name, isFolder: false });
    if (existing?.id) return { id: existing.id, created: false };
    const res = await drive.files.create({
      requestBody: { name, parents: [parentId] },
      media: { mimeType: mime || "application/pdf", body: Readable.from(Buffer.from(bytes)) },
      fields: "id, name",
      supportsAllDrives: true,
    });
    return { id: res.data.id || "", created: true };
  }

  /**
   * Idempotent factura upload with placeholder REPLACEMENT.
   * The file is marked with appProperties.factura_source = "placeholder" | "contasimple".
   *  - No existing file     -> create it, stamping the source.
   *  - Existing placeholder (or unstamped) + real invoice now available
   *                         -> REPLACE its content IN PLACE (same fileId, same name),
   *                            re-stamp source="contasimple". No second file is created.
   *  - Existing already "contasimple", or still placeholder with no real invoice yet
   *                         -> reuse as-is.
   */
  async function ensureFacturaFile(
    parentId: string,
    name: string,
    bytes: Uint8Array,
    mime: string,
    isReal: boolean
  ): Promise<{ id: string; created: boolean; replaced: boolean }> {
    const existing = await findChild(drive, parentId, { name, isFolder: false });
    if (!existing?.id) {
      const res = await drive.files.create({
        requestBody: {
          name,
          parents: [parentId],
          appProperties: { factura_source: isReal ? "contasimple" : "placeholder" },
        },
        media: { mimeType: mime || "application/pdf", body: Readable.from(Buffer.from(bytes)) },
        fields: "id, name",
        supportsAllDrives: true,
      });
      return { id: res.data.id || "", created: true, replaced: false };
    }
    const meta = await drive.files.get({
      fileId: existing.id,
      fields: "id, appProperties",
      supportsAllDrives: true,
    });
    const source = (meta.data.appProperties as any)?.factura_source;
    if (isReal && source !== "contasimple") {
      // Replace the placeholder content in place; keep the same fileId and name.
      await drive.files.update({
        fileId: existing.id,
        requestBody: { appProperties: { factura_source: "contasimple" } },
        media: { mimeType: mime || "application/pdf", body: Readable.from(Buffer.from(bytes)) },
        fields: "id",
        supportsAllDrives: true,
      });
      return { id: existing.id, created: false, replaced: true };
    }
    return { id: existing.id, created: false, replaced: false };
  }

  /** Find a folder under parent whose appProperties.student_code matches (stable id). */
  async function findFolderByStudentCode(
    parentId: string,
    studentCode: string
  ): Promise<drive_v3.Schema$File | null> {
    const q = [
      `'${escapeQuery(parentId)}' in parents`,
      "trashed = false",
      `mimeType = '${FOLDER_MIME}'`,
      `appProperties has { key='student_code' and value='${escapeQuery(studentCode)}' }`,
    ].join(" and ");
    const res = await drive.files.list({
      q,
      fields: "files(id, name, webViewLink, appProperties)",
      pageSize: 10,
      spaces: "drive",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    return (res.data.files || [])[0] || null;
  }

  /**
   * Resolve (idempotently) the student folder, using student_code as the stable id.
   *  1. Search by appProperties.student_code.
   *  2. Else search by plain display name:
   *     - no student_code stamped  -> adopt it (stamp the code).
   *     - same student_code        -> use it.
   *     - different student_code    -> collision: use/create "Nombre Apellidos - CODE".
   *  3. Else create a new folder named with the display name and stamp the code.
   */
  async function ensureStudentFolderByCode(
    parentId: string,
    displayName: string,
    studentCode: string
  ): Promise<{ file: drive_v3.Schema$File; created: boolean }> {
    const byCode = await findFolderByStudentCode(parentId, studentCode);
    if (byCode) return { file: byCode, created: false };

    const byName = await findChild(drive, parentId, { name: displayName, isFolder: true });
    if (byName?.id) {
      const meta = await drive.files.get({
        fileId: byName.id,
        fields: "id, name, webViewLink, appProperties",
        supportsAllDrives: true,
      });
      const existingCode = (meta.data.appProperties as any)?.student_code;
      if (!existingCode) {
        // Unstamped folder with this exact name: adopt it as this student's expediente.
        await drive.files.update({
          fileId: byName.id,
          requestBody: { appProperties: { student_code: studentCode } },
          fields: "id",
          supportsAllDrives: true,
        });
        return { file: meta.data, created: false };
      }
      if (existingCode === studentCode) {
        return { file: meta.data, created: false };
      }
      // Collision: the plain-name folder belongs to a DIFFERENT student.
      const suffixedName = `${displayName} - ${studentCode}`;
      const suffixed = await findChild(drive, parentId, { name: suffixedName, isFolder: true });
      if (suffixed) return { file: suffixed, created: false };
      const createdSuffixed = await drive.files.create({
        requestBody: {
          name: suffixedName,
          mimeType: FOLDER_MIME,
          parents: [parentId],
          appProperties: { student_code: studentCode },
        },
        fields: "id, name, webViewLink",
        supportsAllDrives: true,
      });
      return { file: createdSuffixed.data, created: true };
    }

    // Brand new folder.
    const created = await drive.files.create({
      requestBody: {
        name: displayName,
        mimeType: FOLDER_MIME,
        parents: [parentId],
        appProperties: { student_code: studentCode },
      },
      fields: "id, name, webViewLink",
      supportsAllDrives: true,
    });
    return { file: created.data, created: true };
  }

  async function countFoldersByCode(parentId: string, studentCode: string): Promise<number> {
    const q = [
      `'${escapeQuery(parentId)}' in parents`,
      "trashed = false",
      `mimeType = '${FOLDER_MIME}'`,
      `appProperties has { key='student_code' and value='${escapeQuery(studentCode)}' }`,
    ].join(" and ");
    const res = await drive.files.list({
      q,
      fields: "files(id, name)",
      pageSize: 100,
      spaces: "drive",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    return (res.data.files || []).length;
  }

  // Build the shared parent (MES, or AÑO/MES) once for the whole order.
  let parentId = rootId;
  for (const segment of parentSegments) {
    const folder = await ensureFolderTracked(parentId, segment);
    parentId = folder.file.id as string;
  }
  const monthParentId = parentId;

  // Factura bytes shared across all students (real invoice PDF, or placeholder).
  const facturaIsReal = !!input.facturaPdf;
  const facturaBytes = input.facturaPdf
    ? decodePdfBase64(input.facturaPdf)
    : buildHistoricalTestPdf("Factura (pendiente de Contasimple)", "Expediente de formación BlueDrone");
  const facturaMime = input.facturaPdf?.mime || "application/pdf";

  const results: HistoricalExpedienteStudentResult[] = [];

  for (const s of input.students) {
    const displayName = studentDisplayName(s.firstName, s.lastName);
    const fileNames = historicalStudentFileNames(displayName);

    const studentFolder = await ensureStudentFolderByCode(monthParentId, displayName, s.studentCode);
    const studentId = studentFolder.file.id as string;

    const matriculaBytes = s.matriculaPdf
      ? decodePdfBase64(s.matriculaPdf)
      : buildHistoricalTestPdf("Matrícula (pendiente)", displayName);
    const justificanteBytes = s.justificantePdf
      ? decodePdfBase64(s.justificantePdf)
      : buildHistoricalTestPdf("Justificante de pago (pendiente)", displayName);

    const matricula = await ensureFileTracked(
      studentId,
      fileNames.matricula,
      matriculaBytes,
      s.matriculaPdf?.mime || "application/pdf"
    );
    const factura = await ensureFacturaFile(
      studentId,
      fileNames.factura,
      facturaBytes,
      facturaMime,
      facturaIsReal
    );
    const justificante = await ensureFileTracked(
      studentId,
      fileNames.justificante,
      justificanteBytes,
      s.justificantePdf?.mime || "application/pdf"
    );

    const student_folders_with_code = await countFoldersByCode(monthParentId, s.studentCode);
    const matricula_count = await countChildren(drive, studentId, fileNames.matricula, false);
    const factura_count = await countChildren(drive, studentId, fileNames.factura, false);
    const justificante_count = await countChildren(drive, studentId, fileNames.justificante, false);

    const folderUrl =
      (studentFolder.file.webViewLink as string) ||
      `https://drive.google.com/drive/folders/${studentId}`;

    results.push({
      enrollment_id: s.enrollmentId,
      student_code: s.studentCode,
      display_name: displayName,
      path: [rootName, ...parentSegments, studentFolder.file.name || displayName].join(" / "),
      folder_id: studentId,
      folder_url: folderUrl,
      matricula_file_id: matricula.id,
      factura_file_id: factura.id,
      justificante_file_id: justificante.id,
      factura_replaced: factura.replaced,
      created: {
        folder: studentFolder.created,
        matricula: matricula.created,
        factura: factura.created,
        justificante: justificante.created,
      },
      verification: {
        student_folders_with_code,
        matricula_count,
        factura_count,
        justificante_count,
      },
    });
  }

  return {
    status: "OK",
    payment_date: typeof input.paymentDate === "string" ? input.paymentDate : payDate.toISOString(),
    root: { id: rootId, name: rootName },
    year,
    month,
    students: results,
    contasimple_writes: 0,
  };
}
