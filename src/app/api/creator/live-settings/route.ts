import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET: Load live settings from user preferences
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const prefs = (user.preferences as Record<string, unknown>) || {};
    const liveSettings = (prefs.liveSettings as Record<string, unknown>) || {};

    return NextResponse.json({ liveSettings });
  } catch (error) {
    console.error("GET /api/creator/live-settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT: Save live settings to user preferences
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { streamTitle, tags, mode, guestLimit, roundLength, teamSize } = body;

    const prefs = (user.preferences as Record<string, unknown>) || {};
    const liveSettings: Record<string, unknown> = {};

    if (streamTitle !== undefined) liveSettings.streamTitle = String(streamTitle).slice(0, 200);
    if (tags !== undefined) liveSettings.tags = Array.isArray(tags) ? tags.slice(0, 10) : [];
    if (mode !== undefined) liveSettings.mode = String(mode);
    if (guestLimit !== undefined) liveSettings.guestLimit = Math.min(8, Math.max(2, Number(guestLimit) || 2));
    if (roundLength !== undefined) liveSettings.roundLength = Math.min(300, Math.max(15, Number(roundLength) || 60));
    if (teamSize !== undefined) liveSettings.teamSize = String(teamSize);

    const updatedPrefs = { ...prefs, liveSettings: { ...(prefs.liveSettings as Record<string, unknown> || {}), ...liveSettings } };

    await prisma.user.update({
      where: { id: user.id },
      data: { preferences: updatedPrefs as Record<string, unknown> as import("@/generated/prisma").Prisma.InputJsonValue },
    });

    return NextResponse.json({ liveSettings: updatedPrefs.liveSettings });
  } catch (error) {
    console.error("PUT /api/creator/live-settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
