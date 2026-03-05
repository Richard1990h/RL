import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { buildSessionEnvelope, canTransition, statusToSessionState } from "@/lib/live/session-state";

/**
 * POST /api/live/ingest/auth
 * Called by the RTMP server on prePublish to validate a stream key.
 * Finds the user who owns the key → creates a LiveStream → returns streamId.
 */
export async function POST(request: NextRequest) {
  try {
    let body: { streamKey?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { streamKey } = body;
    if (!streamKey || typeof streamKey !== "string") {
      return NextResponse.json({ error: "streamKey is required" }, { status: 400 });
    }

    // Find user with this RTMP stream key in their preferences
    // Stream keys are stored as preferences.rtmpStreamKey
    const users = await prisma.user.findMany({
      where: { isCreator: true, isBanned: false },
      select: { id: true, preferences: true, displayName: true },
    });

    const user = users.find((u) => {
      const prefs = (u.preferences as Record<string, unknown>) || {};
      return prefs.rtmpStreamKey === streamKey;
    });

    if (!user) {
      return NextResponse.json({ error: "Invalid stream key" }, { status: 403 });
    }

    // End any existing live streams for this user
    const existingLive = await prisma.liveStream.findFirst({
      where: { hostId: user.id, status: "LIVE" },
    });
    if (existingLive) {
      await prisma.liveStream.update({
        where: { id: existingLive.id },
        data: { status: "ENDED", endedAt: new Date() },
      });
      await prisma.liveParticipant.deleteMany({
        where: { liveStreamId: existingLive.id },
      });
    }

    // Load stream settings from user preferences
    const prefs = (user.preferences as Record<string, unknown>) || {};
    const liveSettings = (prefs.liveSettings as Record<string, unknown>) || {};

    const liveStream = await prisma.liveStream.create({
      data: {
        hostId: user.id,
        title: (liveSettings.streamTitle as string) || `${user.displayName}'s Stream`,
        tags: (liveSettings.tags as string[]) || [],
        mode: "STANDARD",
        streamKey: `rly_${uuidv4().replace(/-/g, "")}`,
        status: "LIVE",
        startedAt: new Date(),
      },
    });

    // Add host as participant
    await prisma.liveParticipant.create({
      data: {
        liveStreamId: liveStream.id,
        userId: user.id,
        role: "HOST",
      },
    });

    console.log(`[RTMP Auth] Stream created: ${liveStream.id} for user ${user.id}`);

    return NextResponse.json({
      userId: user.id,
      streamId: liveStream.id,
      rtmpStreamKey: streamKey,
    });
  } catch (error) {
    console.error("POST /api/live/ingest/auth error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
