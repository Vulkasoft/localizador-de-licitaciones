export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { google } from "googleapis";
import { getOAuthClient, encryptToken } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const base = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  const settingsUrl = `${base}/settings`;

  if (error) {
    return NextResponse.redirect(`${settingsUrl}?gcal=denied`);
  }
  if (!session?.user?.id) {
    return NextResponse.redirect(`${base}/login`);
  }
  if (!code) {
    return NextResponse.redirect(`${settingsUrl}?gcal=error`);
  }

  try {
    const oauth2 = getOAuthClient();
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);

    // Fetch the authorizing account's email for display.
    let email: string | null = null;
    try {
      const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
      const me = await oauth2Api.userinfo.get();
      email = me.data.email || null;
    } catch {}

    const existing = await prisma.googleCalendarAccount.findUnique({
      where: { userId: session.user.id },
    });

    // Google only returns a refresh_token on first consent (prompt=consent forces it).
    const refreshToken = tokens.refresh_token
      ? encryptToken(tokens.refresh_token)
      : existing?.refreshToken;

    if (!refreshToken) {
      return NextResponse.redirect(`${settingsUrl}?gcal=no_refresh`);
    }

    await prisma.googleCalendarAccount.upsert({
      where: { userId: session.user.id },
      update: {
        email,
        refreshToken,
        accessToken: tokens.access_token ? encryptToken(tokens.access_token) : existing?.accessToken,
        expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : existing?.expiryDate,
      },
      create: {
        userId: session.user.id,
        email,
        refreshToken,
        accessToken: tokens.access_token ? encryptToken(tokens.access_token) : null,
        expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        calendarId: "primary",
        syncDirection: "bidirectional",
      },
    });

    return NextResponse.redirect(`${settingsUrl}?gcal=connected`);
  } catch (e: any) {
    console.error("Google Calendar callback error:", e?.message || e);
    return NextResponse.redirect(`${settingsUrl}?gcal=error`);
  }
}
