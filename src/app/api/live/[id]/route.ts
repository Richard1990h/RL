import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { buildSessionEnvelope, canTransition, markSessionEnding, statusToSessionState } from "@/lib/live/session-state";

// GET: Get live stream details
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const liveStream = await prisma.liveStream.findUnique({
      where: { id },
      include: {
        host: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, verifiedBadge: true },
        },
        participants: {
          include: {
            user: {
              select: { id: true, username: true, displayName: true, avatarUrl: true },
            },
          },
        },
        moderators: {
          include: {
            user: {
              select: { id: true, username: true, displayName: true, avatarUrl: true },
            },
          },
        },
      },
    });

    if (!liveStream) {
      return NextResponse.json({ error: "Live stream not found" }, { status: 404 });
    }

    const currentUser = await getCurrentUser();
    const actorRole =
      currentUser?.id === liveStream.hostId
        ? "creator"
        : liveStream.participants.some((p) => p.userId === currentUser?.id && p.role === "GUEST" && p.status === "ACTIVE")
          ? "guest"
          : "viewer";

    return NextResponse.json({
      liveStream: {
        ...liveStream,
        viewerCount: liveStream.viewerCount,
      },
      session: buildSessionEnvelope(liveStream),
      authority: {
        source: "server",
        ownerId: liveStream.hostId,
        actorRole,
        capabilities: {
          canControlSession: actorRole === "creator",
          canMutateGameState: actorRole === "creator" || actorRole === "guest",
          canSendDonations: actorRole === "viewer" || actorRole === "guest" || actorRole === "creator",
        },
      },
    });
  } catch (error) {
    console.error("GET /api/live/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT: Update live stream settings (host only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const liveStream = await prisma.liveStream.findUnique({ where: { id } });
    if (!liveStream) {
      return NextResponse.json({ error: "Live stream not found" }, { status: 404 });
    }

    if (liveStream.hostId !== user.id) {
      return NextResponse.json({ error: "Only the host can update stream settings" }, { status: 403 });
    }

    const body = await request.json();
    const { title, tags, roundTimeSec, minDonation, bgColor, bgImageUrl, mode, isBattle } = body;

    const currentState = statusToSessionState(liveStream.status, liveStream.id);
    if (!canTransition(currentState, "live") && !canTransition(currentState, "ending")) {
      return NextResponse.json({ error: "Invalid session transition for update" }, { status: 409 });
    }

    const updated = await prisma.liveStream.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(tags !== undefined && { tags }),
        ...(roundTimeSec !== undefined && { roundTimeSec }),
        ...(minDonation !== undefined && { minDonation }),
        ...(bgColor !== undefined && { bgColor }),
        ...(bgImageUrl !== undefined && { bgImageUrl }),
        ...(mode !== undefined && { mode }),
        ...(isBattle !== undefined && { isBattle }),
      },
      include: {
        host: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
    });

    return NextResponse.json({
      liveStream: updated,
      session: buildSessionEnvelope(updated),
      authority: { source: "server", ownerId: updated.hostId },
    });
  } catch (error) {
    console.error("PUT /api/live/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE: End live stream (host only)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const liveStream = await prisma.liveStream.findUnique({ where: { id } });
    if (!liveStream) {
      return NextResponse.json({ error: "Live stream not found" }, { status: 404 });
    }

    if (liveStream.hostId !== user.id) {
      return NextResponse.json({ error: "Only the host can end the stream" }, { status: 403 });
    }

    const currentState = statusToSessionState(liveStream.status, liveStream.id);
    if (!canTransition(currentState, "ending") && !canTransition(currentState, "ended")) {
      return NextResponse.json({ error: "Invalid session transition: cannot end stream from current state" }, { status: 409 });
    }

    // Explicit transition marker for consumers that poll quickly.
    markSessionEnding(id);

    const ended = await prisma.liveStream.update({
      where: { id },
      data: {
        status: "ENDED",
        endedAt: new Date(),
      },
    });

    // Remove all participants (best effort)
    await prisma.liveParticipant.deleteMany({ where: { liveStreamId: id } }).catch(() => {});

    return NextResponse.json({
      liveStream: ended,
      session: buildSessionEnvelope(ended),
      authority: { source: "server", ownerId: ended.hostId },
    });
  } catch (error) {
    console.error("DELETE /api/live/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
