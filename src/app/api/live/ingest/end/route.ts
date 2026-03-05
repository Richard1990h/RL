import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * POST /api/live/ingest/end
 * Called by the RTMP server on donePublish to end a stream.
 */
export async function POST(request: NextRequest) {
  try {
    let body: { streamKey?: string; streamId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { streamId } = body;
    if (!streamId) {
      return NextResponse.json({ error: "streamId is required" }, { status: 400 });
    }

    const stream = await prisma.liveStream.findUnique({
      where: { id: streamId },
      select: { id: true, status: true },
    });

    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    if (stream.status === "LIVE") {
      await prisma.liveStream.update({
        where: { id: streamId },
        data: { status: "ENDED", endedAt: new Date() },
      });

      await prisma.liveParticipant.deleteMany({
        where: { liveStreamId: streamId },
      });
    }

    console.log(`[RTMP End] Stream ${streamId} ended`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/live/ingest/end error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
