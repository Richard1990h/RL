import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET: Load moderation settings from user preferences
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const prefs = (user.preferences as Record<string, unknown>) || {};
    const moderationSettings = (prefs.moderationSettings as Record<string, unknown>) || {};

    return NextResponse.json({ moderationSettings });
  } catch (error) {
    console.error("GET /api/creator/moderation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT: Save moderation settings to user preferences
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { bannedWords, mutedUsers, blockLinks, slowMode, followersOnly } = body;

    const prefs = (user.preferences as Record<string, unknown>) || {};
    const moderationSettings: Record<string, unknown> = {};

    if (bannedWords !== undefined) moderationSettings.bannedWords = Array.isArray(bannedWords) ? bannedWords.slice(0, 500) : [];
    if (mutedUsers !== undefined) moderationSettings.mutedUsers = Array.isArray(mutedUsers) ? mutedUsers : [];
    if (typeof blockLinks === "boolean") moderationSettings.blockLinks = blockLinks;
    if (typeof slowMode === "boolean") moderationSettings.slowMode = slowMode;
    if (typeof followersOnly === "boolean") moderationSettings.followersOnly = followersOnly;

    const updatedPrefs = { ...prefs, moderationSettings: { ...(prefs.moderationSettings as Record<string, unknown> || {}), ...moderationSettings } };

    await prisma.user.update({
      where: { id: user.id },
      data: { preferences: updatedPrefs as Record<string, unknown> as import("@/generated/prisma").Prisma.InputJsonValue },
    });

    return NextResponse.json({ moderationSettings: updatedPrefs.moderationSettings });
  } catch (error) {
    console.error("PUT /api/creator/moderation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
