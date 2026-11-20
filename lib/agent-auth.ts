import { createHash } from "crypto";
import { prisma } from "@/lib/db";

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export interface AgentAuthResult {
  ok: boolean;
  status?: number;
  error?: string;
  ownerUserId?: string;
  settingsId?: string;
}

/**
 * Verifies the Authorization: Bearer <key> header of an external agent request
 * against the stored (hashed) API key in AgentSettings.
 */
export async function verifyAgentRequest(request: Request): Promise<AgentAuthResult> {
  const authHeader = request.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const headerKey = request.headers.get("x-api-key");
  const key = (match ? match[1] : headerKey || "").trim();
  if (!key) {
    return { ok: false, status: 401, error: "Falta la clave API (cabecera Authorization: Bearer <clave> o X-API-Key)" };
  }

  const settings = await prisma.agentSettings.findFirst({ orderBy: { createdAt: "asc" } });
  if (!settings || !settings.apiKeyHash) {
    return { ok: false, status: 401, error: "El agente no está configurado" };
  }
  if (hashApiKey(key) !== settings.apiKeyHash) {
    return { ok: false, status: 401, error: "Clave API no válida" };
  }
  if (!settings.enabled) {
    return { ok: false, status: 403, error: "El agente está desactivado. Actívalo desde Ajustes en la aplicación." };
  }

  let ownerUserId = settings.ownerUserId;
  if (!ownerUserId) {
    const firstUser = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    ownerUserId = firstUser?.id ?? null;
  }
  if (!ownerUserId) {
    return { ok: false, status: 500, error: "No hay usuario propietario configurado" };
  }

  // Update lastUsedAt (fire and forget)
  prisma.agentSettings
    .update({ where: { id: settings.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { ok: true, ownerUserId, settingsId: settings.id };
}
