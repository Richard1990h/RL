import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

function maskKey(key?: string | null): string | null {
  if (!key) return null;
  if (key.length <= 4) return "*".repeat(key.length);
  return "*".repeat(key.length - 4) + key.slice(-4);
}

function encryptKey(key: string): string {
  return `enc:${Buffer.from(key).toString("base64")}`;
}

// GET: Load integration settings
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const prefs = (user.preferences as Record<string, unknown>) || {};
    const integrations = (prefs.integrations as Record<string, unknown>) || {};

    return NextResponse.json({
      integrations: {
        streamlabsConnected: Boolean(integrations.streamlabsTokenCipher),
        streamlabsTokenMasked: integrations.streamlabsTokenMasked || null,
        obsHost: integrations.obsHost || "localhost",
        obsPort: integrations.obsPort || 4455,
        obsConnected: Boolean(integrations.obsPasswordCipher),
        obsPasswordMasked: integrations.obsPasswordMasked || null,
      },
    });
  } catch (error) {
    console.error("GET /api/creator/integrations error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT: Save integration settings
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const prefs = (user.preferences as Record<string, unknown>) || {};
    const existing = (prefs.integrations as Record<string, unknown>) || {};
    const updated: Record<string, unknown> = { ...existing };

    // Streamlabs token
    if (body.streamlabsToken !== undefined) {
      const token = String(body.streamlabsToken || "").trim();
      if (token) {
        updated.streamlabsTokenCipher = encryptKey(token);
        updated.streamlabsTokenMasked = maskKey(token);
      } else {
        // Clear
        updated.streamlabsTokenCipher = null;
        updated.streamlabsTokenMasked = null;
      }
    }

    // OBS WebSocket settings
    if (body.obsHost !== undefined) {
      updated.obsHost = String(body.obsHost || "localhost").slice(0, 255);
    }
    if (body.obsPort !== undefined) {
      updated.obsPort = Math.min(65535, Math.max(1, Number(body.obsPort) || 4455));
    }
    if (body.obsPassword !== undefined) {
      const pass = String(body.obsPassword || "").trim();
      if (pass) {
        updated.obsPasswordCipher = encryptKey(pass);
        updated.obsPasswordMasked = maskKey(pass);
      } else {
        updated.obsPasswordCipher = null;
        updated.obsPasswordMasked = null;
      }
    }

    const updatedPrefs = { ...prefs, integrations: updated };

    await prisma.user.update({
      where: { id: user.id },
      data: { preferences: updatedPrefs as Record<string, unknown> as import("@/generated/prisma").Prisma.InputJsonValue },
    });

    return NextResponse.json({
      integrations: {
        streamlabsConnected: Boolean(updated.streamlabsTokenCipher),
        streamlabsTokenMasked: updated.streamlabsTokenMasked || null,
        obsHost: updated.obsHost || "localhost",
        obsPort: updated.obsPort || 4455,
        obsConnected: Boolean(updated.obsPasswordCipher),
        obsPasswordMasked: updated.obsPasswordMasked || null,
      },
    });
  } catch (error) {
    console.error("PUT /api/creator/integrations error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
