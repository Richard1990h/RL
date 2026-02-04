import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// POST: Join a live stream
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
    const { role } = body;

    if (!role || !["viewer", "guest"].includes(role)) {
      return NextResponse.json({ error: "role must be 'viewer' or 'guest'" }, { status: 400 });
    }

    const liveStream = await prisma.liveStream.findUnique({ where: { id } });
    if (!liveStream) {
      return NextResponse.json({ error: "Live stream not found" }, { status: 404 });
    }

    if (liveStream.status !== "LIVE") {
      return NextResponse.json({ error: "Live stream is not active" }, { status: 400 });
    }

    // Check if user already joined
    const existingParticipant = await prisma.liveParticipant.findUnique({
      where: { liveStreamId_userId: { liveStreamId: id, userId: user.id } },
    });

    if (existingParticipant) {
      // Already joined — return current viewer count so the client can update
      return NextResponse.json({
        participant: existingParticipant,
        viewerCount: liveStream.viewerCount,
        alreadyJoined: true,
      });
    }

    // If minDonation > 0 and role is viewer, check wallet
    if (liveStream.minDonation > 0 && role === "viewer") {
      const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
      if (!wallet || wallet.credits < liveStream.minDonation) {
        return NextResponse.json(
          { error: `Minimum ${liveStream.minDonation} credits required to join` },
          { status: 402 }
        );
      }
    }

    // Add participant
    const participant = await prisma.liveParticipant.create({
      data: {
        liveStreamId: id,
        userId: user.id,
        role: role === "guest" ? "GUEST" : "VIEWER",
      },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
    });

    // Increment viewer count and update peak
    const updated = await prisma.liveStream.update({
      where: { id },
      data: {
        viewerCount: { increment: 1 },
        peakViewers: {
          set: Math.max(liveStream.peakViewers, liveStream.viewerCount + 1),
        },
      },
    });

    // Count how many times this user has watched this host's streams
    const visitCount = await prisma.liveParticipant.count({
      where: {
        userId: user.id,
        liveStream: { hostId: liveStream.hostId },
      },
    });

    // Post a system welcome message in chat (visible to host, shows visit count)
    await prisma.liveChatMessage.create({
      data: {
        liveStreamId: id,
        userId: user.id,
        text: `Welcome ${participant.user.displayName}! (Visit #${visitCount})`,
        isDonation: false,
        creditAmount: 0,
      },
    }).catch(() => {
      // Best effort - don't fail the join if chat message fails
    });

    return NextResponse.json({
      participant,
      viewerCount: updated.viewerCount,
      visitCount,
    });
  } catch (error) {
    console.error("POST /api/live/[id]/join error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
