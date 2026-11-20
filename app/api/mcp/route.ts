export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { searchProducts, listProducts, searchCustomers, CompanyKey } from '@/lib/contasimple';
import { createEstimateWithLocalBudget, EstimateCreationError } from '@/lib/estimate-creation';
import { invoicePaidTrainingOrder, decideBillingCompany, buildInvoiceLines, TrainingInvoiceError } from '@/lib/training-invoicing';

/**
 * Servidor MCP (Model Context Protocol) sobre HTTP para el agente externo (ChatGPT).
 * - Transporte: Streamable HTTP (JSON-RPC 2.0 por POST, respuesta JSON).
 * - Autenticación: "Authorization: Bearer <clave>" con la credencial guardada
 *   en el backend (AGENT_API_KEY / CHATGPT_AGENT_CHANNEL_ID). Nunca se expone en cliente.
 * - Control: solo funciona si el interruptor "agent_enabled" de Ajustes está activo.
 * Herramientas de licitaciones: buscar_licitaciones, obtener_licitacion.
 * Herramientas de gestión: crear_presupuesto, crear_alarma, listar_presupuestos,
 *   listar_alarmas, buscar_productos, buscar_clientes, crear_presupuesto_contasimple.
 */

const PROTOCOL_VERSION = '2025-03-26';

const emptyToNull = (s: any) => (typeof s === 'string' && s.trim() === '' ? null : s);

const budgetSchema = z.object({
  nombre: z.preprocess(emptyToNull, z.string().nullable().optional()),
  cliente: z.preprocess(emptyToNull, z.string().nullable().optional()),
  comunidadAutonoma: z.preprocess(emptyToNull, z.string().nullable().optional()),
  ciudad: z.preprocess(emptyToNull, z.string().nullable().optional()),
  tipo: z.enum(['LICITACION', 'CONTRATO_MENOR', 'NORMAL', 'OTRO']).default('LICITACION'),
  tipoCustom: z.preprocess(emptyToNull, z.string().nullable().optional()),
  fechaSolicitud: z.preprocess(emptyToNull, z.string().nullable().optional()).transform((s: any) => (s ? new Date(s) : null)),
  fechaEntrega: z.preprocess(emptyToNull, z.string().nullable().optional()).transform((s: any) => (s ? new Date(s) : null)),
  fechaPlazo: z.preprocess(emptyToNull, z.string().nullable().optional()).transform((s: any) => (s ? new Date(s) : null)),
  estado: z
    .enum([
      'PENDIENTE',
      'PENDIENTE_MORA',
      'PENDIENTE_OROZCO',
      'PENDIENTE_RETENCION_CREDITO',
      'LICITACION_ENVIADA',
      'PRESUPUESTO_ENVIADO',
      'ENTREGADO',
      'PAGADO',
    ])
    .default('PENDIENTE'),
  descripcion: z.preprocess(emptyToNull, z.string().nullable().optional()),
  notas: z.preprocess(emptyToNull, z.string().nullable().optional()),
});

const alarmSchema = z.object({
  titulo: z.string().min(1),
  descripcion: z.string().optional().nullable(),
  fechaLimite: z.string().min(1),
  diasAntelacion: z.number().int().min(0).default(1),
  emailsDestino: z.string().min(1),
  documentos: z.string().optional().nullable(),
  budgetId: z.string().optional().nullable(),
});

const companySchema = z.enum(['canarias', 'peninsula']).default('canarias');

const estimateLineSchema = z.object({
  concept: z.string().min(1),
  quantity: z.number().positive().default(1),
  unitAmount: z.number().min(0).default(0),
  vatPercentage: z.number().min(0).optional().nullable(),
  discountPercentage: z.number().min(0).max(100).optional().nullable(),
  detailedDescription: z.preprocess(emptyToNull, z.string().nullable().optional()),
  productId: z.number().optional().nullable(),
  productName: z.preprocess(emptyToNull, z.string().nullable().optional()),
});

const contasimpleEstimateSchema = z.object({
  company: companySchema,
  targetEntityId: z.number().optional().nullable(),
  clienteNombre: z.preprocess(emptyToNull, z.string().nullable().optional()),
  lines: z.array(estimateLineSchema).min(1),
  notes: z.preprocess(emptyToNull, z.string().nullable().optional()),
  expirationDate: z.preprocess(emptyToNull, z.string().nullable().optional()),
  nombre: z.preprocess(emptyToNull, z.string().nullable().optional()),
  comunidadAutonoma: z.preprocess(emptyToNull, z.string().nullable().optional()),
  ciudad: z.preprocess(emptyToNull, z.string().nullable().optional()),
  descripcion: z.preprocess(emptyToNull, z.string().nullable().optional()),
  fechaPlazo: z.preprocess(emptyToNull, z.string().nullable().optional()),
});

const billingAddressSchema = z.object({
  organization: z.preprocess(emptyToNull, z.string().nullable().optional()),
  firstname: z.preprocess(emptyToNull, z.string().nullable().optional()),
  lastname: z.preprocess(emptyToNull, z.string().nullable().optional()),
  nif: z.string().min(1),
  address: z.preprocess(emptyToNull, z.string().nullable().optional()),
  province: z.preprocess(emptyToNull, z.string().nullable().optional()),
  city: z.preprocess(emptyToNull, z.string().nullable().optional()),
  postalCode: z.preprocess(emptyToNull, z.string().nullable().optional()),
  countryIso: z.preprocess(emptyToNull, z.string().nullable().optional()),
  phone: z.preprocess(emptyToNull, z.string().nullable().optional()),
  email: z.preprocess(emptyToNull, z.string().email().nullable().optional()),
});

const trainingOrderLineSchema = z.object({
  productId: z.number().int().positive().optional().nullable(),
  productName: z.string().min(1),
  quantity: z.number().positive(),
  totalPriceTaxExcl: z.number(),
  totalPriceTaxIncl: z.number(),
});

const trainingInvoiceSchema = z.object({
  confirmar: z.boolean().default(false),
  orderId: z.number().int().positive(),
  orderReference: z.preprocess(emptyToNull, z.string().nullable().optional()),
  paidAt: z.string().min(1),
  paymentMethod: z.preprocess(emptyToNull, z.string().nullable().optional()),
  billing: billingAddressSchema,
  lines: z.array(trainingOrderLineSchema).min(1),
  totalDiscountsTaxExcl: z.number().default(0),
  totalDiscountsTaxIncl: z.number().default(0),
  totalShippingTaxExcl: z.number().default(0),
  totalShippingTaxIncl: z.number().default(0),
  totalPaidTaxIncl: z.number().positive(),
  markPaid: z.boolean().default(true),
});

const TOOLS = [
  {
    name: 'buscar_licitaciones',
    description:
      'Busca licitaciones públicas de drones en España registradas en la plataforma. Devuelve título, órgano de contratación, presupuesto, plazos, puntuación de relevancia y enlaces a los pliegos. Usa "obtener_licitacion" para el detalle completo de una licitación concreta.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Texto a buscar en título, descripción u órgano de contratación' },
        region: { type: 'string', description: 'Comunidad autónoma (p. ej. "Canarias", "Andalucía")' },
        minScore: { type: 'number', description: 'Puntuación mínima de relevancia (0-100)' },
        limit: { type: 'number', description: 'Máximo de resultados (por defecto 25, máximo 100)' },
      },
    },
  },
  {
    name: 'obtener_licitacion',
    description:
      'Devuelve el detalle completo de una licitación por su id: descripción, lotes, presupuesto, plazos y TODOS los enlaces a documentos y pliegos (técnico y administrativo) para poder leerlos y preparar el presupuesto.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Identificador de la licitación (campo "id" devuelto por buscar_licitaciones)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'crear_presupuesto',
    description:
      'Crea un nuevo presupuesto o licitación en la plataforma de gestión. Devuelve el id del presupuesto creado, que puede usarse como budgetId al crear una alarma vinculada.',
    inputSchema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre del presupuesto o licitación' },
        cliente: { type: 'string', description: 'Nombre del cliente u organismo' },
        comunidadAutonoma: { type: 'string', description: 'Comunidad autónoma' },
        ciudad: { type: 'string', description: 'Ciudad' },
        tipo: { type: 'string', enum: ['LICITACION', 'CONTRATO_MENOR', 'NORMAL', 'OTRO'], description: 'Tipo de presupuesto (por defecto LICITACION)' },
        fechaSolicitud: { type: 'string', description: 'Fecha de solicitud en formato ISO (2026-08-15)' },
        fechaEntrega: { type: 'string', description: 'Fecha de entrega en formato ISO' },
        fechaPlazo: { type: 'string', description: 'Fecha límite del plazo en formato ISO' },
        estado: { type: 'string', enum: ['PENDIENTE', 'PENDIENTE_MORA', 'PENDIENTE_OROZCO', 'PENDIENTE_RETENCION_CREDITO', 'LICITACION_ENVIADA', 'PRESUPUESTO_ENVIADO', 'ENTREGADO', 'PAGADO'], description: 'Estado inicial (por defecto PENDIENTE)' },
        descripcion: { type: 'string', description: 'Descripción o resumen del pliego' },
        notas: { type: 'string', description: 'Notas adicionales' },
      },
    },
  },
  {
    name: 'crear_alarma',
    description:
      'Crea una alarma de recordatorio con envío diario de emails desde los días de antelación indicados hasta la fecha límite. Puede vincularse a un presupuesto mediante budgetId.',
    inputSchema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Título de la alarma' },
        fechaLimite: { type: 'string', description: 'Fecha límite en formato ISO (2026-08-15)' },
        emailsDestino: { type: 'string', description: 'Emails de destino separados por comas' },
        diasAntelacion: { type: 'number', description: 'Días de antelación para empezar a avisar (por defecto 1)' },
        descripcion: { type: 'string', description: 'Descripción del recordatorio' },
        documentos: { type: 'string', description: 'Documentación a presentar' },
        budgetId: { type: 'string', description: 'Id del presupuesto vinculado (opcional)' },
      },
      required: ['titulo', 'fechaLimite', 'emailsDestino'],
    },
  },
  {
    name: 'listar_presupuestos',
    description: 'Lista los presupuestos más recientes de la plataforma con su id, nombre, cliente, tipo, estado y fecha de plazo.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'listar_alarmas',
    description: 'Lista las alarmas activas de la plataforma con su id, título, fecha límite y emails de destino.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'buscar_productos',
    description:
      "Busca productos en el catálogo real de Contasimple por nombre o SKU. Devuelve id, nombre, precio unitario e impuesto (IGIC/IVA) de cada producto. Si no hay resultados, prueba con términos más cortos o alternativos (p. ej. 'Matrice', 'M4TD', 'Dock', 'DJI', 'batería'). Si se llama sin query, lista el catálogo paginado.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: "Texto a buscar en el nombre o SKU del producto (p. ej. 'Dock 3', 'M4TD')" },
        company: { type: 'string', enum: ['canarias', 'peninsula'], description: "Empresa de Contasimple: 'canarias' (IGIC 7%) o 'peninsula' (IVA 21%). Por defecto canarias." },
        page: { type: 'number', description: 'Página al listar sin query (por defecto 1)' },
      },
    },
  },
  {
    name: 'buscar_clientes',
    description:
      'Busca clientes reales en Contasimple por nombre, organización o NIF. Devuelve el id (targetEntityId) necesario para crear_presupuesto_contasimple.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: "Nombre, organización o NIF del cliente (p. ej. 'Ayuntamiento de Mogán')" },
        company: { type: 'string', enum: ['canarias', 'peninsula'], description: 'Empresa de Contasimple. Por defecto canarias.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'crear_presupuesto_contasimple',
    description:
      "Crea un presupuesto REAL en Contasimple (estado 'Creado', numeración automática) con líneas de producto, y lo replica en la plataforma de gestión como pendiente de revisión. Los precios pueden dejarse a 0 o estimados: siempre quedan pendientes de valoración humana. Usa antes buscar_clientes para obtener targetEntityId y buscar_productos para identificar productos reales del catálogo (incluye productId y productName cuando exista el producto).",
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', enum: ['canarias', 'peninsula'], description: "Empresa de Contasimple: 'canarias' (IGIC 7%) o 'peninsula' (IVA 21%). Por defecto canarias." },
        targetEntityId: { type: 'number', description: 'Id del cliente en Contasimple (obtenido con buscar_clientes). Recomendado.' },
        clienteNombre: { type: 'string', description: 'Nombre o NIF del cliente si no se conoce targetEntityId (se buscará; si hay varios candidatos se devolverá la lista)' },
        lines: {
          type: 'array',
          description: 'Líneas del presupuesto',
          items: {
            type: 'object',
            properties: {
              concept: { type: 'string', description: 'Concepto de la línea (nombre del producto o servicio)' },
              quantity: { type: 'number', description: 'Cantidad (por defecto 1)' },
              unitAmount: { type: 'number', description: 'Precio unitario sin impuestos. Déjalo a 0 si está pendiente de valoración.' },
              vatPercentage: { type: 'number', description: 'Porcentaje de IGIC/IVA. Si se omite: 7 en canarias, 21 en península.' },
              detailedDescription: { type: 'string', description: 'Descripción detallada de la línea' },
              productId: { type: 'number', description: 'Id del producto en Contasimple (de buscar_productos)' },
              productName: { type: 'string', description: 'Nombre del producto en Contasimple' },
            },
            required: ['concept'],
          },
        },
        notes: { type: 'string', description: 'Notas del presupuesto en Contasimple (p. ej. referencia del pliego)' },
        expirationDate: { type: 'string', description: 'Fecha de validez del presupuesto en formato ISO' },
        nombre: { type: 'string', description: 'Nombre para la ficha local en la plataforma de gestión' },
        comunidadAutonoma: { type: 'string', description: 'Comunidad autónoma (para la ficha local)' },
        ciudad: { type: 'string', description: 'Ciudad (para la ficha local)' },
        descripcion: { type: 'string', description: 'Descripción o resumen del pliego (para la ficha local)' },
        fechaPlazo: { type: 'string', description: 'Fecha límite del plazo de presentación en formato ISO (para la ficha local)' },
      },
      required: ['lines'],
    },
  },
  {
    name: "facturar_formacion_pagada",
    description:
      "Previsualiza o crea la factura REAL de un pedido de formación ya pagado en PrestaShop. Decide automáticamente Canarias/Península por la dirección de facturación, busca o crea el cliente por NIF/CIF/NIE, respeta los impuestos exactos del pedido y evita duplicados por orderId. Por seguridad solo escribe en Contasimple cuando confirmar=true.",
    inputSchema: {
      type: "object",
      properties: {
        confirmar: { type: "boolean", description: "Debe ser true para crear cliente/factura y registrar el pago. Con false solo previsualiza." },
        orderId: { type: "number", description: "ID real del pedido de PrestaShop" },
        orderReference: { type: "string", description: "Referencia del pedido de PrestaShop" },
        paidAt: { type: "string", description: "Fecha/hora de confirmación del pago en formato ISO" },
        paymentMethod: { type: "string", description: "Método de pago, p. ej. 'Redsys - Tarjeta'" },
        billing: {
          type: "object",
          properties: {
            organization: { type: "string", description: "Empresa/razón social si existe" },
            firstname: { type: "string" },
            lastname: { type: "string" },
            nif: { type: "string", description: "NIF/CIF/NIE del destinatario de la factura" },
            address: { type: "string" },
            province: { type: "string" },
            city: { type: "string" },
            postalCode: { type: "string" },
            countryIso: { type: "string", description: "Código ISO-2, por defecto ES" },
            phone: { type: "string" },
            email: { type: "string" }
          },
          required: ["nif"]
        },
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              productId: { type: "number" },
              productName: { type: "string" },
              quantity: { type: "number" },
              totalPriceTaxExcl: { type: "number", description: "Total de la línea sin impuestos tal como figura en PrestaShop" },
              totalPriceTaxIncl: { type: "number", description: "Total de la línea con impuestos tal como figura en PrestaShop" }
            },
            required: ["productName", "quantity", "totalPriceTaxExcl", "totalPriceTaxIncl"]
          }
        },
        totalDiscountsTaxExcl: { type: "number" },
        totalDiscountsTaxIncl: { type: "number" },
        totalShippingTaxExcl: { type: "number" },
        totalShippingTaxIncl: { type: "number" },
        totalPaidTaxIncl: { type: "number", description: "Importe total pagado por el pedido" },
        markPaid: { type: "boolean", description: "Si true intenta registrar el cobro con TPV/Redsys/Tarjeta en Contasimple" }
      },
      required: ["orderId", "paidAt", "billing", "lines", "totalPaidTaxIncl"]
    }
  },
];

const TENDER_SELECT = {
  id: true, sourceId: true, title: true, description: true,
  contractingBody: true, buyerType: true, cpvCodes: true,
  budgetAmount: true, budgetCurrency: true, deadline: true,
  publicationDate: true, status: true, tenderPhase: true,
  regionCcaa: true, province: true, municipality: true,
  category: true, classification: true, score: true,
  sourceUrl: true, adminDocUrl: true, technicalDocUrl: true,
  cachedAdminDocUrl: true, cachedTechnicalDocUrl: true,
  documentsJson: true, lotsJson: true, isMinorContract: true,
  awardedAmount: true, awardedTo: true,
} as const;

function mapTender(t: any) {
  let documents: any[] = [];
  try { documents = t?.documentsJson ? JSON.parse(t.documentsJson) : []; } catch { documents = []; }
  let lots: any[] = [];
  try { lots = t?.lotsJson ? JSON.parse(t.lotsJson) : []; } catch { lots = []; }
  const { documentsJson, lotsJson, ...rest } = t ?? {};
  return {
    ...rest,
    pliegos: {
      tecnico: t?.cachedTechnicalDocUrl || t?.technicalDocUrl || null,
      administrativo: t?.cachedAdminDocUrl || t?.adminDocUrl || null,
    },
    documents,
    lots,
  };
}

async function searchTenders(args: any) {
  const limit = Math.min(Math.max(parseInt(String(args?.limit ?? '25'), 10) || 25, 1), 100);
  const minScore = parseInt(String(args?.minScore ?? '0'), 10) || 0;
  const where: any = { dismissed: false };
  if (minScore > 0) where.score = { gte: minScore };
  if (args?.region) where.regionCcaa = String(args.region);
  if (args?.q) {
    const q = String(args.q);
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { contractingBody: { contains: q, mode: 'insensitive' } },
    ];
  }
  const tenders = await prisma.tender.findMany({
    where,
    orderBy: [{ score: 'desc' }, { publicationDate: 'desc' }],
    take: limit,
    select: TENDER_SELECT,
  });
  return { count: (tenders ?? []).length, tenders: (tenders ?? []).map(mapTender) };
}

async function getTender(args: any) {
  const id = String(args?.id ?? '').trim();
  if (!id) return { error: 'Falta el parámetro "id"' };
  const t = await prisma.tender.findFirst({
    where: { OR: [{ id }, { sourceId: id }] },
    select: TENDER_SELECT,
  });
  if (!t) return { error: `No se encontró ninguna licitación con id "${id}"` };
  return { tender: mapTender(t) };
}

// Resuelve el usuario propietario de los registros creados por el agente:
// primero un administrador, si no el usuario más antiguo de la plataforma.
async function resolveOwnerUserId(): Promise<string | null> {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (admin) return admin.id;
  const oldest = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  return oldest?.id ?? null;
}

function rpcResult(id: any, result: any) {
  return NextResponse.json({ jsonrpc: '2.0', id, result });
}

function rpcError(id: any, code: number, message: string, status = 200) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, { status });
}

function toolText(id: any, data: any, isError = false) {
  return rpcResult(id, {
    content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
    isError,
  });
}

async function callManagementTool(name: string, args: any, id: any) {
  switch (name) {
    case 'crear_presupuesto': {
      const ownerUserId = await resolveOwnerUserId();
      if (!ownerUserId) return toolText(id, 'No hay ningún usuario en la plataforma para asignar el presupuesto', true);
      const data = budgetSchema.parse(args ?? {});
      const budget = await prisma.budget.create({ data: { ...data, userId: ownerUserId } });
      await prisma.auditLog.create({
        data: {
          budgetId: budget.id,
          userId: ownerUserId,
          accion: 'CREATE',
          detalles: `Presupuesto creado por el agente (MCP): ${budget.nombre ?? '(sin nombre)'}`,
        },
      });
      return toolText(id, {
        success: true,
        message: 'Presupuesto creado correctamente',
        budget: { id: budget.id, nombre: budget.nombre, cliente: budget.cliente, tipo: budget.tipo, estado: budget.estado, fechaPlazo: budget.fechaPlazo },
      });
    }
    case 'crear_alarma': {
      const ownerUserId = await resolveOwnerUserId();
      if (!ownerUserId) return toolText(id, 'No hay ningún usuario en la plataforma para asignar la alarma', true);
      const data = alarmSchema.parse(args ?? {});
      const fechaLimite = new Date(data.fechaLimite);
      if (isNaN(fechaLimite.getTime())) {
        return toolText(id, 'fechaLimite no es una fecha válida (usa formato ISO, p. ej. 2026-08-15)', true);
      }
      if (data.budgetId) {
        const budget = await prisma.budget.findUnique({ where: { id: data.budgetId } });
        if (!budget) return toolText(id, 'El presupuesto vinculado (budgetId) no existe', true);
      }
      const alarm = await prisma.alarm.create({
        data: {
          userId: ownerUserId,
          budgetId: data.budgetId || null,
          titulo: data.titulo,
          descripcion: data.descripcion || null,
          fechaLimite,
          diasAntelacion: data.diasAntelacion,
          emailsDestino: data.emailsDestino,
          documentos: data.documentos || null,
        },
      });
      return toolText(id, {
        success: true,
        message: 'Alarma creada correctamente. Se enviarán recordatorios diarios por email hasta la fecha límite.',
        alarm: { id: alarm.id, titulo: alarm.titulo, fechaLimite: alarm.fechaLimite, diasAntelacion: alarm.diasAntelacion, emailsDestino: alarm.emailsDestino, budgetId: alarm.budgetId },
      });
    }
    case 'listar_presupuestos': {
      const budgets = await prisma.budget.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, nombre: true, cliente: true, tipo: true, estado: true, fechaPlazo: true, comunidadAutonoma: true, ciudad: true },
      });
      return toolText(id, { budgets });
    }
    case 'listar_alarmas': {
      const alarms = await prisma.alarm.findMany({
        where: { estado: 'ACTIVA' },
        orderBy: { fechaLimite: 'asc' },
        take: 50,
        select: { id: true, titulo: true, fechaLimite: true, diasAntelacion: true, emailsDestino: true, budgetId: true },
      });
      return toolText(id, { alarms });
    }
    case 'buscar_productos': {
      const company: CompanyKey = args?.company === 'peninsula' ? 'peninsula' : 'canarias';
      const query = typeof args?.query === 'string' ? args.query.trim() : '';
      if (query) {
        const products = await searchProducts(company, query);
        const mapped = products.map((p) => ({ id: p.id, name: p.name, sku: p.internalCode, price: p.price, vatPercentage: p.vat, description: p.description }));
        if (mapped.length === 0) {
          return toolText(id, {
            products: [],
            sugerencia: `Sin resultados para "${query}" en ${company}. Prueba con términos más cortos o alternativos (p. ej. 'Matrice', 'M4', 'Dock', 'DJI', 'batería') o llama sin query para listar el catálogo completo.`,
          });
        }
        return toolText(id, { company, total: mapped.length, products: mapped });
      }
      const page = typeof args?.page === 'number' && args.page > 0 ? args.page : 1;
      const result = await listProducts(company, page, 50);
      return toolText(id, {
        company,
        page,
        total: result.totalCount,
        products: result.data.map((p) => ({ id: p.id, name: p.name, sku: p.internalCode, price: p.price, vatPercentage: p.vat })),
      });
    }
    case 'buscar_clientes': {
      const company: CompanyKey = args?.company === 'peninsula' ? 'peninsula' : 'canarias';
      const query = typeof args?.query === 'string' ? args.query.trim() : '';
      if (!query) return toolText(id, 'Debes indicar el parámetro query con el nombre o NIF del cliente', true);
      const customers = await searchCustomers(company, query);
      if (customers.length === 0) {
        return toolText(id, {
          customers: [],
          sugerencia: `Sin resultados para "${query}" en ${company}. Prueba con una parte del nombre (p. ej. 'Mogan' en lugar de 'Ayuntamiento de Mogán') o con el NIF.`,
        });
      }
      return toolText(id, {
        company,
        customers: customers.map((c) => ({ targetEntityId: c.id, organization: c.organization, nif: c.nif })),
      });
    }
    case 'crear_presupuesto_contasimple': {
      const ownerUserId = await resolveOwnerUserId();
      if (!ownerUserId) return toolText(id, 'No hay ningún usuario en la plataforma para asignar el presupuesto', true);
      const data = contasimpleEstimateSchema.parse(args ?? {});
      try {
        const result = await createEstimateWithLocalBudget(
          {
            company: data.company,
            targetEntityId: data.targetEntityId ?? null,
            clienteNombre: data.clienteNombre ?? null,
            lines: data.lines,
            notes: data.notes ?? null,
            expirationDate: data.expirationDate ?? null,
            nombre: data.nombre ?? null,
            comunidadAutonoma: data.comunidadAutonoma ?? null,
            ciudad: data.ciudad ?? null,
            descripcion: data.descripcion ?? null,
            fechaPlazo: data.fechaPlazo ?? null,
          },
          ownerUserId,
          'el agente (MCP)'
        );
        return toolText(id, {
          success: true,
          message:
            "Presupuesto REAL creado en Contasimple (estado 'Creado') y replicado en la plataforma de gestión. Los precios quedan pendientes de valoración y revisión humana antes de enviarlo.",
          contasimple: {
            id: result.estimate?.id ?? null,
            number: result.estimate?.number ?? null,
            company: data.company,
          },
          matchedCustomer: result.matchedCustomer,
          localBudgetId: result.localBudgetId,
        });
      } catch (error) {
        if (error instanceof EstimateCreationError) {
          return toolText(id, { error: error.message, candidates: error.candidates ?? undefined }, true);
        }
        throw error;
      }
    }
    case "facturar_formacion_pagada": {
      const data = trainingInvoiceSchema.parse(args ?? {});
      const input = {
        orderId: data.orderId,
        orderReference: data.orderReference ?? null,
        paidAt: data.paidAt,
        paymentMethod: data.paymentMethod ?? null,
        billing: data.billing,
        lines: data.lines,
        totalDiscountsTaxExcl: data.totalDiscountsTaxExcl,
        totalDiscountsTaxIncl: data.totalDiscountsTaxIncl,
        totalShippingTaxExcl: data.totalShippingTaxExcl,
        totalShippingTaxIncl: data.totalShippingTaxIncl,
        totalPaidTaxIncl: data.totalPaidTaxIncl,
        markPaid: data.markPaid,
      };

      try {
        const decision = decideBillingCompany(input.billing);
        const invoiceLines = buildInvoiceLines(input);

        if (!data.confirmar) {
          return toolText(id, {
            success: true,
            preview: true,
            requiere_confirmacion: true,
            message: "Previsualización correcta. No se ha creado ni modificado nada en Contasimple. Repite con confirmar=true para emitir la factura real.",
            billingDecision: decision,
            orderId: data.orderId,
            totalPaidTaxIncl: data.totalPaidTaxIncl,
            lines: invoiceLines,
          });
        }

        const result = await invoicePaidTrainingOrder(input);
        return toolText(id, {
          ...result,
          preview: false,
          message: result.invoice.created
            ? "Factura real de formación creada en Contasimple."
            : "El pedido ya estaba facturado: se ha reutilizado la factura existente sin duplicarla.",
        });
      } catch (error) {
        if (error instanceof TrainingInvoiceError) {
          return toolText(id, { error: error.message, code: error.code, details: error.details }, true);
        }
        throw error;
      }
    }
    default:
      return null;
  }
}

function extractBearer(request: Request): string {
  const auth = request.headers.get('authorization') ?? '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return (request.headers.get('x-agent-key') ?? '').trim();
}

export async function POST(request: Request) {
  // 1) Autenticación: clave API de la aplicación (AGENT_API_KEY).
  //    Se acepta también el identificador de canal antiguo por compatibilidad.
  const validKeys = [process.env.AGENT_API_KEY, process.env.CHATGPT_AGENT_CHANNEL_ID].filter(Boolean) as string[];
  const provided = extractBearer(request);
  if (validKeys.length === 0 || !provided || !validKeys.includes(provided)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  let msg: any;
  try { msg = await request.json(); } catch {
    return rpcError(null, -32700, 'JSON inválido');
  }
  if (Array.isArray(msg)) msg = msg[0]; // soporte básico (sin lotes JSON-RPC)
  const { id, method, params } = msg ?? {};

  try {
    // Notificaciones (sin id) → aceptar sin cuerpo
    if (id === undefined || id === null) {
      return new NextResponse(null, { status: 202 });
    }

    if (method === 'initialize') {
      return rpcResult(id, {
        protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'localizador-licitaciones', version: '1.0.0' },
        instructions:
          'Servidor del Localizador de Licitaciones de Drones (España) con gestión de presupuestos y Contasimple. Usa buscar_licitaciones y obtener_licitacion para encontrar licitaciones y sus pliegos. Usa buscar_clientes y buscar_productos para localizar clientes y productos reales del catálogo de Contasimple, crear_presupuesto_contasimple para crear presupuestos REALES en Contasimple (precios pendientes de valoración humana), crear_presupuesto para fichas internas y crear_alarma para recordatorios por email de fechas límite.',
      });
    }

    if (method === 'ping') return rpcResult(id, {});

    if (method === 'tools/list') return rpcResult(id, { tools: TOOLS });

    if (method === 'tools/call') {
      // El interruptor de Ajustes controla el uso real de las herramientas
      const setting = await prisma.setting.findUnique({ where: { key: 'agent_enabled' } });
      if (setting?.value !== 'true') {
        return rpcResult(id, {
          content: [{ type: 'text', text: 'El agente está desactivado. Actívalo desde Ajustes en la plataforma del Localizador de Licitaciones.' }],
          isError: true,
        });
      }
      const name = params?.name;
      const args = params?.arguments ?? {};
      // Herramientas de licitaciones
      if (name === 'buscar_licitaciones' || name === 'obtener_licitacion') {
        const data = name === 'buscar_licitaciones' ? await searchTenders(args) : await getTender(args);
        return rpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
          isError: Boolean((data as any)?.error),
        });
      }
      // Herramientas de gestión (presupuestos, alarmas, Contasimple)
      try {
        const managed = await callManagementTool(name, args, id);
        if (managed) return managed;
      } catch (error) {
        if (error instanceof z.ZodError) {
          return toolText(id, { error: 'Datos no válidos', details: error.errors }, true);
        }
        throw error;
      }
      return rpcError(id, -32602, `Herramienta desconocida: ${name}`);
    }

    return rpcError(id, -32601, `Método no soportado: ${method}`);
  } catch (error: any) {
    console.error('[api/mcp] error:', error?.message ?? error);
    return rpcError(id ?? null, -32603, 'Error interno del servidor');
  }
}

// El transporte Streamable HTTP permite rechazar GET (no se usa canal SSE dedicado)
export async function GET() {
  return NextResponse.json({ error: 'Método no permitido. Usa POST (MCP Streamable HTTP).' }, { status: 405 });
}
