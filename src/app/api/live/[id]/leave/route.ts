import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { buildSessionEnvelope } from "@/lib/live/session-state";

// POST: Leave a live stream
export async function POST(
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

    // Check if user is a participant
    const participant = await prisma.liveParticipant.findUnique({
      where: { liveStreamId_userId: { liveStreamId: id, userId: user.id } },
    });

    if (!participant) {
      return NextResponse.json({ error: "Not a participant in this stream" }, { status: 400 });
    }

    // Remove participant
    await prisma.liveParticipant.delete({
      where: { liveStreamId_userId: { liveStreamId: id, userId: user.id } },
    });

    // Decrement viewer count (minimum 0)
    await prisma.liveStream.update({
      where: { id },
      data: {
        viewerCount: { decrement: liveStream.viewerCount > 0 ? 1 : 0 },
      },
    });

    return NextResponse.json({
      success: true,
      session: buildSessionEnvelope(liveStream),
      authority: { source: "server", ownerId: liveStream.hostId, actor: "viewer" },
    });
  } catch (error) {
    console.error("POST /api/live/[id]/leave error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
