import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";
import { buildSessionEnvelope, canTransition, statusToSessionState } from "@/lib/live/session-state";

// GET: List active live streams
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode") || "all";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 1));
    const skip = (page - 1) * limit;

    // Auto-end stale streams: if the host hasn't sent a heartbeat in 2+ minutes,
    // the stream is abandoned (tab closed, connection lost, etc.)
    const staleThreshold = new Date(Date.now() - 2 * 60 * 1000);
    try {
      const staleStreams = await prisma.liveStream.findMany({
        where: { status: "LIVE" },
        include: { host: { select: { lastActiveAt: true } } },
      });
      const staleIds = staleStreams
        .filter((s) => !s.host.lastActiveAt || s.host.lastActiveAt < staleThreshold)
        .map((s) => s.id);
      if (staleIds.length > 0) {
        await prisma.liveStream.updateMany({
          where: { id: { in: staleIds } },
          data: { status: "ENDED", endedAt: new Date() },
        });
        await prisma.liveParticipant.deleteMany({
          where: { liveStreamId: { in: staleIds } },
        });
      }
    } catch {
      // Non-critical — don't fail the listing
    }

    const where: Record<string, unknown> = {
      status: "LIVE",
    };

    if (mode !== "all") {
      if (mode === "battle") {
        where.isBattle = true;
      } else {
        const modeMap: Record<string, string> = {
          standard: "STANDARD",
          rooms: "ROOMS",
          timer_wars: "TIMER_WARS",
          tower_wars: "TOWER_WARS",
          trivia: "TRIVIA",
          auction: "AUCTION",
          spin_wheel: "SPIN_WHEEL",
          last_standing: "LAST_STANDING",
        };
        if (modeMap[mode]) {
          where.mode = modeMap[mode];
        }
      }
    }

    const [streams, total] = await Promise.all([
      prisma.liveStream.findMany({
        where,
        include: {
          host: {
            select: { id: true, username: true, displayName: true, avatarUrl: true, verifiedBadge: true },
          },
          _count: {
            select: { participants: true },
          },
        },
        orderBy: { viewerCount: "desc" },
        skip,
        take: limit,
      }),
      prisma.liveStream.count({ where }),
    ]);

    // Normalize to match frontend LiveRoom shape and deduplicate by host
    const seenHosts = new Set<string>();
    const normalized = streams
      .map((s) => ({
        id: s.id,
        hostId: s.hostId,
        title: s.title,
        tags: Array.isArray(s.tags) ? s.tags : [],
        viewerCount: s.viewerCount,
        isBattleRoom: s.isBattle,
        mode: s.mode.toLowerCase(),
        participants: [],
        startTime: s.startedAt?.toISOString() ?? s.createdAt.toISOString(),
        roundTimeSec: s.roundTimeSec,
        hostCutPercent: s.hostCutPercent,
        host: s.host,
        session: buildSessionEnvelope(s),
        authority: { source: "server", ownerId: s.hostId },
      }))
      .filter((s) => {
        if (seenHosts.has(s.hostId)) return false;
        seenHosts.add(s.hostId);
        return true;
      });

    return NextResponse.json({
      streams: normalized,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/live error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: Create/start a live stream
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!user.isCreator) {
      return NextResponse.json({ error: "Only creators can start live streams" }, { status: 403 });
    }

    // Check eligibility: 5 videos, 100 views, 50 likes (owner bypasses)
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { isOwner: true },
    });

    if (!fullUser?.isOwner) {
      const REQUIRED_VIDEOS = 5;
      const REQUIRED_VIEWS = 100;
      const REQUIRED_LIKES = 50;

      const [videoCount, viewsResult, likesResult] = await Promise.all([
        prisma.video.count({
          where: { creatorId: user.id, status: { not: "DELETED" } },
        }),
        prisma.video.aggregate({
          where: { creatorId: user.id, status: { not: "DELETED" } },
          _sum: { views: true },
        }),
        prisma.video.aggregate({
          where: { creatorId: user.id, status: { not: "DELETED" } },
          _sum: { likes: true },
        }),
      ]);

      const totalViews = viewsResult._sum.views ?? 0;
      const totalLikes = likesResult._sum.likes ?? 0;

      if (videoCount < REQUIRED_VIDEOS || totalViews < REQUIRED_VIEWS || totalLikes < REQUIRED_LIKES) {
        return NextResponse.json(
          {
            error: "You are not eligible to go live yet",
            requirements: {
              videos: { current: videoCount, required: REQUIRED_VIDEOS },
              views: { current: totalViews, required: REQUIRED_VIEWS },
              likes: { current: totalLikes, required: REQUIRED_LIKES },
            },
          },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    const { title, tags, isBattle, mode, roundTimeSec, minDonation, bgColor, bgImageUrl, hostCutPercent } = body;

    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    // Validate mode enum
    const validModes = ["STANDARD", "TIMER_WARS", "TOWER_WARS", "ROOMS", "TRIVIA", "AUCTION", "SPIN_WHEEL", "LAST_STANDING"];
    const normalizedMode = (mode ? String(mode).toUpperCase() : "STANDARD") as import("@/generated/prisma").LiveMode;
    if (!validModes.includes(normalizedMode)) {
      return NextResponse.json({ error: `Invalid mode. Must be one of: ${validModes.join(", ")}` }, { status: 400 });
    }

    // Validate hostCutPercent
    const validatedHostCut = typeof hostCutPercent === "number" && Number.isInteger(hostCutPercent) && hostCutPercent >= 0 && hostCutPercent <= 100
      ? hostCutPercent
      : 0;

    // Validate bgColor format if provided
    if (bgColor && !/^#[0-9A-Fa-f]{3,8}$/.test(bgColor)) {
      return NextResponse.json({ error: "Invalid color format" }, { status: 400 });
    }

    // Validate bgImageUrl if provided
    if (bgImageUrl && typeof bgImageUrl === "string" && bgImageUrl.length > 2048) {
      return NextResponse.json({ error: "Image URL too long" }, { status: 400 });
    }

    // Prevent duplicate active streams per user
    const existingLive = await prisma.liveStream.findFirst({
      where: { hostId: user.id, status: "LIVE" },
    });
    if (existingLive) {
      // End the old stream before starting a new one
      await prisma.liveStream.update({
        where: { id: existingLive.id },
        data: { status: "ENDED", endedAt: new Date() },
      });
    }

    // Generate unique stream key
    const streamKey = `rly_${uuidv4().replace(/-/g, "")}`;

    const createFrom = statusToSessionState("WAITING", `new_${user.id}`);
    if (!canTransition(createFrom, "live")) {
      return NextResponse.json({ error: "Invalid session transition while creating stream" }, { status: 409 });
    }

    const liveStream = await prisma.liveStream.create({
      data: {
        hostId: user.id,
        title,
        tags: tags || [],
        isBattle: isBattle ?? false,
        mode: normalizedMode,
        roundTimeSec: roundTimeSec || 0,
        minDonation: minDonation || 0,
        hostCutPercent: validatedHostCut,
        bgColor: bgColor || null,
        bgImageUrl: bgImageUrl || null,
        streamKey,
        status: "LIVE",
        startedAt: new Date(),
      },
      include: {
        host: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
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

    return NextResponse.json({
      liveStream,
      session: buildSessionEnvelope(liveStream),
      authority: { source: "server", ownerId: liveStream.hostId },
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/live error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
