import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ExcelJS from "exceljs";

export const dynamic = "force-dynamic";

const VALID_TIPOS = ["LICITACION", "CONTRATO_MENOR", "NORMAL", "OTRO"] as const;
const VALID_ESTADOS = [
  "PENDIENTE",
  "PENDIENTE_MORA",
  "PENDIENTE_OROZCO",
  "PENDIENTE_RETENCION_CREDITO",
  "LICITACION_ENVIADA",
  "PRESUPUESTO_ENVIADO",
  "ENTREGADO",
  "PAGADO",
] as const;

function normalizeHeader(s: any): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseDate(value: any): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const s = String(value).trim();
  if (!s) return null;
  // DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    const dt = new Date(parseInt(y), parseInt(mo) - 1, parseInt(d));
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

function normalizeTipo(raw: any): { tipo: string; tipoCustom: string | null } {
  const v = String(raw ?? "").trim();
  if (!v) return { tipo: "NORMAL", tipoCustom: null };
  const upper = v.toUpperCase().replace(/\s+/g, "_");
  if ((VALID_TIPOS as readonly string[]).includes(upper)) {
    return { tipo: upper, tipoCustom: null };
  }
  // Common synonyms
  if (/licitaci/i.test(v)) return { tipo: "LICITACION", tipoCustom: null };
  if (/contrato.*menor/i.test(v)) return { tipo: "CONTRATO_MENOR", tipoCustom: null };
  if (/normal/i.test(v)) return { tipo: "NORMAL", tipoCustom: null };
  // Anything else -> OTRO with custom value
  return { tipo: "OTRO", tipoCustom: v };
}

function normalizeEstado(raw: any): string {
  const v = String(raw ?? "").trim();
  if (!v) return "PENDIENTE";
  const upper = v.toUpperCase().replace(/\./g, "").replace(/\s+/g, "_");
  if ((VALID_ESTADOS as readonly string[]).includes(upper)) return upper;
  // Synonyms
  if (/retenci/i.test(v) && /cr[eé]dito/i.test(v)) return "PENDIENTE_RETENCION_CREDITO";
  if (/licitaci[oó]n.*enviada/i.test(v)) return "LICITACION_ENVIADA";
  if (/presupuesto.*enviado/i.test(v)) return "PRESUPUESTO_ENVIADO";
  if (/mora/i.test(v)) return "PENDIENTE_MORA";
  if (/orozco/i.test(v)) return "PENDIENTE_OROZCO";
  if (/entregado/i.test(v)) return "ENTREGADO";
  if (/pagado/i.test(v)) return "PAGADO";
  if (/pendiente/i.test(v)) return "PENDIENTE";
  return "PENDIENTE";
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return NextResponse.json({ error: "No sheet found" }, { status: 400 });
    }

    // Build header map
    const headerRow = worksheet.getRow(1);
    const headerMap: Record<string, number> = {};
    headerRow.eachCell((cell, colNumber) => {
      headerMap[normalizeHeader(cell.value)] = colNumber;
    });

    const getCol = (...names: string[]): number | undefined => {
      for (const n of names) {
        const k = normalizeHeader(n);
        if (headerMap[k]) return headerMap[k];
      }
      return undefined;
    };

    const colNombre = getCol("nombre");
    const colCliente = getCol("cliente");
    const colTipo = getCol("tipo");
    const colTipoCustom = getCol("tipo personalizado", "tipocustom", "tipo custom");
    const colComunidad = getCol("comunidad autonoma", "comunidad", "comunidad autónoma");
    const colCiudad = getCol("ciudad");
    const colFechaSolicitud = getCol("fecha solicitud", "fecha de solicitud");
    const colFechaEntrega = getCol("fecha entrega", "fecha de entrega");
    const colFechaPlazo = getCol("fecha plazo", "plazo");
    const colEstado = getCol("estado");
    const colDescripcion = getCol("descripcion", "descripción");
    const colNotas = getCol("notas");

    const getCellText = (row: ExcelJS.Row, colIdx?: number): string => {
      if (!colIdx) return "";
      const v: any = row.getCell(colIdx).value;
      if (v === null || v === undefined) return "";
      if (typeof v === "object" && "text" in v) return String((v as any).text ?? "");
      if (typeof v === "object" && "result" in v) return String((v as any).result ?? "");
      if (typeof v === "object" && "richText" in v) return ((v as any).richText || []).map((r: any) => r.text).join("");
      return String(v);
    };

    const getCellRaw = (row: ExcelJS.Row, colIdx?: number): any => {
      if (!colIdx) return null;
      return row.getCell(colIdx).value;
    };

    const created: any[] = [];
    const errors: { row: number; error: string }[] = [];
    const rowCount = worksheet.rowCount;

    for (let r = 2; r <= rowCount; r++) {
      const row = worksheet.getRow(r);
      // Skip empty rows
      const hasAny =
        getCellText(row, colNombre) ||
        getCellText(row, colCliente) ||
        getCellText(row, colDescripcion) ||
        getCellText(row, colCiudad);
      if (!hasAny) continue;

      try {
        const { tipo, tipoCustom: tipoFromTipo } = normalizeTipo(getCellText(row, colTipo));
        const explicitTipoCustom = getCellText(row, colTipoCustom).trim();
        const tipoCustom = tipo === "OTRO" ? (explicitTipoCustom || tipoFromTipo || null) : null;

        const data: any = {
          userId: session.user.id,
          nombre: getCellText(row, colNombre).trim() || null,
          cliente: getCellText(row, colCliente).trim() || null,
          comunidadAutonoma: getCellText(row, colComunidad).trim() || null,
          ciudad: getCellText(row, colCiudad).trim() || null,
          tipo,
          tipoCustom,
          fechaSolicitud: parseDate(getCellRaw(row, colFechaSolicitud)),
          fechaEntrega: parseDate(getCellRaw(row, colFechaEntrega)),
          fechaPlazo: parseDate(getCellRaw(row, colFechaPlazo)),
          estado: normalizeEstado(getCellText(row, colEstado)),
          descripcion: getCellText(row, colDescripcion).trim() || null,
          notas: getCellText(row, colNotas).trim() || null,
        };

        const budget = await prisma.budget.create({ data });
        await prisma.auditLog.create({
          data: {
            budgetId: budget.id,
            userId: session.user.id,
            accion: "CREATE",
            detalles: `Presupuesto importado desde Excel: ${budget.nombre ?? "(sin nombre)"}`,
          },
        });
        created.push(budget);
      } catch (err: any) {
        console.error("Import row error", r, err);
        errors.push({ row: r, error: err?.message || "Error al crear" });
      }
    }

    return NextResponse.json({
      success: true,
      imported: created.length,
      errors,
    });
  } catch (error: any) {
    console.error("Error importing excel:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error?.message },
      { status: 500 }
    );
  }
}
