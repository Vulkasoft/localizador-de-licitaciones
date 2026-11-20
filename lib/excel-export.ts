import ExcelJS from "exceljs";
import { Budget, BudgetFile, User } from "@prisma/client";

interface BudgetWithRelations extends Budget {
  user: User | null;
  files: BudgetFile[];
}

export async function generateBudgetExcel(
  budgets: BudgetWithRelations[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Presupuestos");

  // Define columns
  const columns = [
    { header: "Nombre", key: "nombre", width: 22 },
    { header: "Cliente", key: "cliente", width: 20 },
    { header: "Tipo", key: "tipo", width: 15 },
    { header: "Tipo Personalizado", key: "tipoCustom", width: 18 },
    { header: "Comunidad Autonoma", key: "comunidadAutonoma", width: 18 },
    { header: "Ciudad", key: "ciudad", width: 15 },
    { header: "Usuario", key: "usuario", width: 15 },
    { header: "Fecha Solicitud", key: "fechaSolicitud", width: 15 },
    { header: "Fecha Entrega", key: "fechaEntrega", width: 15 },
    { header: "Fecha Plazo", key: "fechaPlazo", width: 15 },
    { header: "Estado", key: "estado", width: 12 },
    { header: "Descripcion", key: "descripcion", width: 30 },
    { header: "Notas", key: "notas", width: 30 },
  ];

  worksheet.columns = columns;

  // Style header
  worksheet.getRow(1).eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2563EB" },
    };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  // Add data rows
  budgets.forEach((budget, index) => {
    const row = worksheet.addRow({
      nombre: budget.nombre || "",
      cliente: budget.cliente,
      tipo: budget.tipo,
      tipoCustom: (budget as any).tipoCustom || "",
      comunidadAutonoma: budget.comunidadAutonoma,
      ciudad: budget.ciudad,
      usuario: budget.user?.name || budget.user?.email || "N/A",
      fechaSolicitud: budget.fechaSolicitud
        ? formatDate(budget.fechaSolicitud)
        : "",
      fechaEntrega: budget.fechaEntrega
        ? formatDate(budget.fechaEntrega)
        : "",
      fechaPlazo: budget.fechaPlazo ? formatDate(budget.fechaPlazo) : "",
      estado: budget.estado,
      descripcion: budget.descripcion,
      notas: budget.notas || "",
    });

    // Apply alternating row colors
    const bgColor = index % 2 === 0 ? "FFF0F9FA" : "FFFFFFFF";
    row.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: bgColor },
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
      cell.alignment = { wrapText: true, vertical: "top" };

      // Color code status
      if (cell.value === "PENDIENTE") {
        cell.font = { color: { argb: "FFD32F2F" } };
      } else if (cell.value === "PENDIENTE_MORA") {
        cell.font = { color: { argb: "FF1976D2" } };
      } else if (cell.value === "PENDIENTE_OROZCO") {
        cell.font = { color: { argb: "FF7B1FA2" } };
      } else if (cell.value === "PENDIENTE_RETENCION_CREDITO") {
        cell.font = { color: { argb: "FFB45309" } };
      } else if (cell.value === "LICITACION_ENVIADA") {
        cell.font = { color: { argb: "FF1D4ED8" } };
      } else if (cell.value === "PRESUPUESTO_ENVIADO") {
        cell.font = { color: { argb: "FF0D9488" } };
      } else if (cell.value === "ENTREGADO") {
        cell.font = { color: { argb: "FFF57C00" } };
      } else if (cell.value === "PAGADO") {
        cell.font = { color: { argb: "FF388E3C" } };
      }
    });

    // Set row height for better visibility
    row.height = 25;
  });

  // Freeze header row
  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as Buffer;
}

function formatDate(date: Date): string {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}
