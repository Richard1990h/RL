import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const URL_TTL_SECONDS = 60;

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("videoId");
    const quality = searchParams.get("quality") ?? "144p";

    if (!videoId) {
      return NextResponse.json({ error: "videoId is required" }, { status: 400 });
    }

    if (!["144p", "240p"].includes(quality)) {
      return NextResponse.json({ error: "Unsupported quality" }, { status: 400 });
    }

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: {
        id: true,
        creatorId: true,
        title: true,
        storagePath: true,
        videoUrl: true,
        status: true,
      },
    });

    if (!video || video.status !== "READY") {
      return NextResponse.json({ error: "Video not available" }, { status: 404 });
    }

    // Access policy: uploader or follower can prefetch.
    const isCreator = video.creatorId === user.id;
    const follow = isCreator
      ? true
      : Boolean(await prisma.follow.findFirst({
          where: {
            followerId: user.id,
            followingId: video.creatorId,
          },
          select: { id: true },
        }));

    if (!follow) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = Date.now();
    const expiresAt = new Date(now + URL_TTL_SECONDS * 1000).toISOString();
    const nonce = randomUUID();

    return NextResponse.json({
      videoId: video.id,
      quality,
      expiresAt,
      nonce,
      signedManifestUrl: `/api/uploads/${video.id}/manifest.m3u8?quality=${quality}&exp=${Math.floor((now + URL_TTL_SECONDS * 1000) / 1000)}&nonce=${nonce}`,
      fallbackUrl: video.videoUrl,
      storagePath: video.storagePath,
      ttlSeconds: URL_TTL_SECONDS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
