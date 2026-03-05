import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/live/[id]/hls
 * Returns the HLS playlist URL for an RTMP-sourced stream.
 * Looks up the stream host's rtmpStreamKey to build the HLS path.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const stream = await prisma.liveStream.findUnique({
      where: { id },
      select: {
        hostId: true,
        status: true,
        host: { select: { preferences: true } },
      },
    });

    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    const prefs = (stream.host.preferences as Record<string, unknown>) || {};
    const rtmpKey = prefs.rtmpStreamKey as string | undefined;

    if (!rtmpKey) {
      return NextResponse.json({ hlsUrl: null, source: "browser" });
    }

    // The RTMP server outputs HLS to: http://localhost:8888/live/{key}/index.m3u8
    // In production this would be proxied through nginx or a CDN
    const rtmpHttpPort = process.env.RTMP_HTTP_PORT || "8888";
    const hlsUrl = `http://localhost:${rtmpHttpPort}/live/${rtmpKey}/index.m3u8`;

    return NextResponse.json({ hlsUrl, source: "rtmp" });
  } catch (error) {
    console.error("GET /api/live/[id]/hls error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
