import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const limitParam = Number(new URL(request.url).searchParams.get("limit") ?? "24");
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(24, limitParam)) : 24;

    const follows = await prisma.follow.findMany({
      where: { followerId: user.id },
      select: { followingId: true },
      take: 100,
    });

    const creatorIds = follows.map((f) => f.followingId);
    if (creatorIds.length === 0) {
      return NextResponse.json({ videos: [], policy: { qualities: ["144p", "240p"] } });
    }

    const videos = await prisma.video.findMany({
      where: {
        creatorId: { in: creatorIds },
        status: "READY",
        visibility: "PUBLIC",
      },
      orderBy: { uploadDate: "desc" },
      take: limit,
      select: {
        id: true,
        creatorId: true,
        title: true,
        thumbnailUrl: true,
        durationSec: true,
        uploadDate: true,
        storagePath: true,
        videoUrl: true,
      },
    });

    return NextResponse.json({
      videos: videos.map((video) => ({
        videoId: video.id,
        creatorId: video.creatorId,
        title: video.title,
        thumbnailUrl: video.thumbnailUrl,
        durationSec: video.durationSec,
        uploadDate: video.uploadDate,
        hls: {
          quality: ["144p", "240p"],
          manifestPath: video.storagePath,
          fallbackUrl: video.videoUrl,
        },
      })),
      policy: {
        maxOfflineVideos: 18,
        maxOfflineBytes: 800 * 1024 * 1024,
        expiresDays: 3,
        wifiOnlyPrefetch: true,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
