import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import crypto from "crypto";

function generateStreamKey(): string {
  return `rly_live_${crypto.randomBytes(16).toString("hex")}`;
}

// GET: Return the user's persistent RTMP stream key (generate if missing)
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const prefs = (user.preferences as Record<string, unknown>) || {};
    let streamKey = prefs.rtmpStreamKey as string | undefined;

    // Auto-generate if they don't have one yet
    if (!streamKey) {
      streamKey = generateStreamKey();
      const updatedPrefs = { ...prefs, rtmpStreamKey: streamKey };
      await prisma.user.update({
        where: { id: user.id },
        data: { preferences: updatedPrefs as Record<string, unknown> as import("@/generated/prisma").Prisma.InputJsonValue },
      });
    }

    return NextResponse.json({
      streamKey,
      rtmpUrl: "rtmp://rallylive.ca/live",
    });
  } catch (error) {
    console.error("GET /api/creator/stream-key error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: Regenerate the stream key (invalidates the old one)
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const prefs = (user.preferences as Record<string, unknown>) || {};
    const streamKey = generateStreamKey();
    const updatedPrefs = { ...prefs, rtmpStreamKey: streamKey };

    await prisma.user.update({
      where: { id: user.id },
      data: { preferences: updatedPrefs as Record<string, unknown> as import("@/generated/prisma").Prisma.InputJsonValue },
    });

    return NextResponse.json({
      streamKey,
      rtmpUrl: "rtmp://rallylive.ca/live",
    });
  } catch (error) {
    console.error("POST /api/creator/stream-key error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
