import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET: Return decrypted Streamlabs token — only for the authenticated user themselves.
// This is called by the go-live page to connect to Streamlabs WebSocket.
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const prefs = (user.preferences as Record<string, unknown>) || {};
    const integrations = (prefs.integrations as Record<string, unknown>) || {};

    const cipher = integrations.streamlabsTokenCipher as string | null;
    let streamlabsToken: string | null = null;
    if (cipher && cipher.startsWith("enc:")) {
      streamlabsToken = Buffer.from(cipher.slice(4), "base64").toString("utf-8");
    }

    const obsCipher = integrations.obsPasswordCipher as string | null;
    let obsPassword: string | null = null;
    if (obsCipher && obsCipher.startsWith("enc:")) {
      obsPassword = Buffer.from(obsCipher.slice(4), "base64").toString("utf-8");
    }

    return NextResponse.json({
      streamlabsToken,
      obsHost: (integrations.obsHost as string) || null,
      obsPort: (integrations.obsPort as number) || null,
      obsPassword,
    });
  } catch (error) {
    console.error("GET /api/creator/integrations/token error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
