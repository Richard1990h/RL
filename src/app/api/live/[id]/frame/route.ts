import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

// In-memory store for latest video frames + audio per stream
// Video and audio have separate timestamps so viewers can deduplicate
interface StreamData {
  frame: string;
  frameUpdatedAt: number;
  audio?: string;
  audioUpdatedAt: number;
}
const frameStore = new Map<string, StreamData>();

// Cleanup frames older than 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [id, data] of frameStore) {
    if (now - data.frameUpdatedAt > 60_000) {
      frameStore.delete(id);
    }
  }
}, 30_000);

// GET: Retrieve latest frame + audio for a stream
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = frameStore.get(id);

    if (!data) {
      return NextResponse.json({ frame: null, audio: null, updatedAt: 0, audioUpdatedAt: 0 });
    }

    return NextResponse.json({
      frame: data.frame,
      audio: data.audio || null,
      updatedAt: data.frameUpdatedAt,
      audioUpdatedAt: data.audioUpdatedAt,
    });
  } catch (error) {
    console.error("GET /api/live/[id]/frame error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: Upload a new frame + optional audio (host only)
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

    // Verify the user is the stream host
    const stream = await (await import("@/lib/db")).prisma.liveStream.findUnique({
      where: { id },
      select: { hostId: true },
    });
    if (!stream || stream.hostId !== user.id) {
      return NextResponse.json({ error: "Only the stream host can post frames" }, { status: 403 });
    }

    const body = await request.json();
    const { frame, audio } = body;

    if (!frame || typeof frame !== "string") {
      return NextResponse.json({ error: "frame (base64 string) is required" }, { status: 400 });
    }

    // Limit frame size to ~500KB
    if (frame.length > 700_000) {
      return NextResponse.json({ error: "Frame too large" }, { status: 413 });
    }

    // Limit audio chunk to ~200KB
    if (audio && typeof audio === "string" && audio.length > 300_000) {
      return NextResponse.json({ error: "Audio chunk too large" }, { status: 413 });
    }

    const existing = frameStore.get(id);
    const now = Date.now();

    frameStore.set(id, {
      frame,
      frameUpdatedAt: now,
      // Only update audio if new audio was provided, otherwise keep existing
      audio: (audio && typeof audio === "string") ? audio : existing?.audio,
      audioUpdatedAt: (audio && typeof audio === "string") ? now : (existing?.audioUpdatedAt ?? 0),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/live/[id]/frame error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
