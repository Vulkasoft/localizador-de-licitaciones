import { google } from "googleapis";
import crypto from "crypto";
import { prisma } from "@/lib/db";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

// ---- Token encryption at rest (AES-256-GCM keyed from NEXTAUTH_SECRET) ----
function getKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET || "fallback-dev-secret-change-me";
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptToken(payload: string): string {
  try {
    const [ivB64, tagB64, dataB64] = payload.split(":");
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    // Backwards-compat: if it was stored in plaintext for any reason.
    return payload;
  }
}

// ---- Redirect URI ----
// Must EXACTLY match a redirect URI registered in Google Cloud Console.
// Debe registrarse en Google Cloud Console: <NEXTAUTH_URL>/api/calendar/google/callback
export function getRedirectUri(): string {
  const explicit = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  if (explicit) return explicit;
  const base = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/calendar/google/callback`;
}

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CALENDAR_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    getRedirectUri()
  );
}

export function getAuthUrl(state: string): string {
  const oauth2 = getOAuthClient();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force refresh_token to be returned
    scope: SCOPES,
    state,
    include_granted_scopes: true,
  });
}

// Returns an authenticated Calendar client for a given user, refreshing tokens as needed.
export async function getCalendarClientForUser(userId: string) {
  const account = await prisma.googleCalendarAccount.findUnique({ where: { userId } });
  if (!account) return null;

  const oauth2 = getOAuthClient();
  oauth2.setCredentials({
    refresh_token: decryptToken(account.refreshToken),
    access_token: account.accessToken ? decryptToken(account.accessToken) : undefined,
    expiry_date: account.expiryDate ? account.expiryDate.getTime() : undefined,
  });

  // Persist any refreshed access token automatically.
  oauth2.on("tokens", async (tokens) => {
    try {
      const data: any = {};
      if (tokens.access_token) data.accessToken = encryptToken(tokens.access_token);
      if (tokens.expiry_date) data.expiryDate = new Date(tokens.expiry_date);
      if (tokens.refresh_token) data.refreshToken = encryptToken(tokens.refresh_token);
      if (Object.keys(data).length) {
        await prisma.googleCalendarAccount.update({ where: { userId }, data });
      }
    } catch (e) {
      console.error("Error persisting refreshed Google tokens:", e);
    }
  });

  const calendar = google.calendar({ version: "v3", auth: oauth2 });
  return { calendar, account, oauth2 };
}

type LocalEvent = {
  id: string;
  titulo: string;
  descripcion?: string | null;
  fechaHora: Date;
  lugar?: string | null;
  googleEventId?: string | null;
};

function toGoogleEvent(ev: LocalEvent) {
  const start = new Date(ev.fechaHora);
  const end = new Date(start.getTime() + 60 * 60 * 1000); // default 1h duration
  return {
    summary: ev.titulo,
    description: ev.descripcion || undefined,
    location: ev.lugar || undefined,
    start: { dateTime: start.toISOString(), timeZone: "Atlantic/Canary" },
    end: { dateTime: end.toISOString(), timeZone: "Atlantic/Canary" },
  };
}

// Push a single local event to Google (create or update). Returns googleEventId or null.
export async function pushEventToGoogle(userId: string, ev: LocalEvent): Promise<string | null> {
  const client = await getCalendarClientForUser(userId);
  if (!client) return null;
  const { calendar, account } = client;
  if (account.syncDirection === "read_only") return null;

  const requestBody = toGoogleEvent(ev);
  try {
    if (ev.googleEventId) {
      const res = await calendar.events.update({
        calendarId: account.calendarId,
        eventId: ev.googleEventId,
        requestBody,
      });
      return res.data.id || ev.googleEventId;
    } else {
      const res = await calendar.events.insert({
        calendarId: account.calendarId,
        requestBody,
      });
      return res.data.id || null;
    }
  } catch (e: any) {
    // If the event was deleted on Google, try to recreate it.
    if (ev.googleEventId && (e?.code === 404 || e?.code === 410)) {
      try {
        const res = await calendar.events.insert({ calendarId: account.calendarId, requestBody });
        return res.data.id || null;
      } catch (e2) {
        console.error("Error recreating Google event:", e2);
        return null;
      }
    }
    console.error("Error pushing event to Google:", e?.message || e);
    return null;
  }
}

export async function deleteEventFromGoogle(userId: string, googleEventId: string): Promise<void> {
  const client = await getCalendarClientForUser(userId);
  if (!client) return;
  const { calendar, account } = client;
  if (account.syncDirection === "read_only") return;
  try {
    await calendar.events.delete({ calendarId: account.calendarId, eventId: googleEventId });
  } catch (e: any) {
    if (e?.code !== 404 && e?.code !== 410) {
      console.error("Error deleting Google event:", e?.message || e);
    }
  }
}

// Pull events from Google into the local DB (Google -> local). Additive, non-destructive.
export async function pullEventsFromGoogle(userId: string): Promise<{ imported: number; updated: number; deleted: number }> {
  const client = await getCalendarClientForUser(userId);
  if (!client) return { imported: 0, updated: 0, deleted: 0 };
  const { calendar, account } = client;
  if (account.syncDirection === "push_only") return { imported: 0, updated: 0, deleted: 0 };

  const timeMin = new Date();
  timeMin.setMonth(timeMin.getMonth() - 1);
  const timeMax = new Date();
  timeMax.setMonth(timeMax.getMonth() + 12);

  let imported = 0;
  let updated = 0;
  let deleted = 0;
  let pageToken: string | undefined = undefined;

  // Track which Google event IDs are still present (non-cancelled) so we can
  // remove local copies of events that were deleted on Google.
  const seenIds = new Set<string>();
  const cancelledIds = new Set<string>();

  do {
    const res: any = await calendar.events.list({
      calendarId: account.calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
      showDeleted: true, // include cancelled events so deletions propagate
      pageToken,
    });
    const items = res.data.items || [];
    for (const item of items) {
      if (!item.id) continue;
      if (item.status === "cancelled") {
        cancelledIds.add(item.id);
        continue;
      }
      const startStr = item.start?.dateTime || item.start?.date;
      if (!startStr) continue;
      seenIds.add(item.id);
      const fechaHora = new Date(startStr);
      const titulo = item.summary || "(Sin título)";
      const descripcion = item.description || null;
      const lugar = item.location || null;

      // Upsert on the (userId, googleEventId) unique key so concurrent syncs
      // (focus/visibility/interval triggers across tabs) can never double-create.
      const existing = await prisma.event.findUnique({
        where: { userId_googleEventId: { userId, googleEventId: item.id } },
      });
      await prisma.event.upsert({
        where: { userId_googleEventId: { userId, googleEventId: item.id } },
        update: { titulo, descripcion, fechaHora, lugar, syncedAt: new Date(), googleCalendarId: account.calendarId },
        create: {
          userId,
          titulo,
          descripcion,
          fechaHora,
          lugar,
          googleEventId: item.id,
          googleCalendarId: account.calendarId,
          syncedAt: new Date(),
        },
      });
      if (existing) updated++;
      else imported++;
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  // 1) Delete local copies of events Google explicitly reported as cancelled.
  if (cancelledIds.size > 0) {
    const del = await prisma.event.deleteMany({
      where: { userId, googleEventId: { in: Array.from(cancelledIds) } },
    });
    deleted += del.count;
  }

  // 2) Safety net: remove local synced events within the window whose Google
  //    event no longer appears at all (hard-purged, not returned as cancelled).
  const localSynced = await prisma.event.findMany({
    where: {
      userId,
      googleEventId: { not: null },
      googleCalendarId: account.calendarId,
      fechaHora: { gte: timeMin, lte: timeMax },
    },
    select: { id: true, googleEventId: true },
  });
  const orphanIds = localSynced
    .filter((e) => e.googleEventId && !seenIds.has(e.googleEventId))
    .map((e) => e.id);
  if (orphanIds.length > 0) {
    const del = await prisma.event.deleteMany({ where: { id: { in: orphanIds } } });
    deleted += del.count;
  }

  await prisma.googleCalendarAccount.update({
    where: { userId },
    data: { lastSyncAt: new Date() },
  });

  return { imported, updated, deleted };
}

// Push all local events that are not yet on Google (local -> Google).
export async function pushAllLocalEvents(userId: string): Promise<{ pushed: number }> {
  const client = await getCalendarClientForUser(userId);
  if (!client) return { pushed: 0 };
  const { account } = client;
  if (account.syncDirection === "read_only") return { pushed: 0 };

  const events = await prisma.event.findMany({
    where: { userId, googleEventId: null },
  });
  let pushed = 0;
  for (const ev of events) {
    const gid = await pushEventToGoogle(userId, ev as any);
    if (gid) {
      await prisma.event.update({
        where: { id: ev.id },
        data: { googleEventId: gid, googleCalendarId: account.calendarId, syncedAt: new Date() },
      });
      pushed++;
    }
  }
  return { pushed };
}
