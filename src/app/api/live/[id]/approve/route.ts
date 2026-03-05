import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// POST: Approve or reject a join request
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { participantId, action } = body;

    if (!action || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'approve' or 'reject'" },
        { status: 400 }
      );
    }

    if (!participantId) {
      return NextResponse.json({ error: "participantId is required" }, { status: 400 });
    }

    const liveStream = await prisma.liveStream.findUnique({
      where: { id },
      include: { moderators: true },
    });

    if (!liveStream) {
      return NextResponse.json({ error: "Live stream not found" }, { status: 404 });
    }

    // Check if user is host or moderator
    const isHost = liveStream.hostId === user.id;
    const isModerator = liveStream.moderators.some((m) => m.userId === user.id);

    if (!isHost && !isModerator) {
      return NextResponse.json(
        { error: "Only host or moderators can approve/reject join requests" },
        { status: 403 }
      );
    }

    const participant = await prisma.liveParticipant.findUnique({
      where: { id: participantId },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
    });

    if (!participant) {
      return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    }

    if (participant.liveStreamId !== id) {
      return NextResponse.json({ error: "Participant does not belong to this stream" }, { status: 400 });
    }

    if (action === "approve") {
      const updated = await prisma.liveParticipant.update({
        where: { id: participantId },
        data: { status: "ACTIVE" },
        include: {
          user: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      });

      // Increment viewer count
      await prisma.liveStream.update({
        where: { id },
        data: {
          viewerCount: { increment: 1 },
          peakViewers: {
            set: Math.max(liveStream.peakViewers, liveStream.viewerCount + 1),
          },
        },
      });

      return NextResponse.json({
        success: true,
        action: "approve",
        participant: updated,
        message: `${updated.user.displayName} has been approved to join`,
      });
    } else {
      // Reject: update status to REJECTED
      await prisma.liveParticipant.update({
        where: { id: participantId },
        data: { status: "REJECTED" },
      });

      return NextResponse.json({
        success: true,
        action: "reject",
        participantId,
        message: "Join request rejected",
      });
    }
  } catch (error) {
    console.error("POST /api/live/[id]/approve error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET: Get pending join requests for a stream
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const liveStream = await prisma.liveStream.findUnique({
      where: { id },
      include: { moderators: true },
    });

    if (!liveStream) {
      return NextResponse.json({ error: "Live stream not found" }, { status: 404 });
    }

    const isHost = liveStream.hostId === user.id;
    const isModerator = liveStream.moderators.some((m) => m.userId === user.id);

    if (!isHost && !isModerator) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const pending = await prisma.liveParticipant.findMany({
      where: {
        liveStreamId: id,
        status: "PENDING",
      },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    return NextResponse.json({ requests: pending });
  } catch (error) {
    console.error("GET /api/live/[id]/approve error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
