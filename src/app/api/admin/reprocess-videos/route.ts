import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOwnerWithDevice } from "@/lib/auth";
import { processVideo } from "@/lib/video-processing";
import path from "path";
import { existsSync } from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/reprocess-videos
 *
 * One-time migration endpoint that finds all existing READY videos
 * whose files haven't been processed yet (no "processed_" prefix in URL)
 * and queues them for ffmpeg re-encoding.
 *
 * All metadata (title, description, tags, thumbnail, etc.) is preserved.
 * Only the video file on disk and the videoUrl in the DB are updated.
 *
 * Videos are set to PROCESSING during re-encoding and flipped back to READY
 * when done. If processing fails, they're marked FAILED.
 */
export async function POST(req: NextRequest) {
  try {
    await requireOwnerWithDevice();

    // Find all READY videos that still have unprocessed files
    const videos = await prisma.video.findMany({
      where: {
        status: "READY",
        videoUrl: { not: null },
        // Only pick videos whose URL does NOT contain "processed_"
        NOT: {
          videoUrl: { contains: "processed_" },
        },
      },
      select: {
        id: true,
        title: true,
        videoUrl: true,
      },
    });

    if (videos.length === 0) {
      return NextResponse.json({
        message: "No unprocessed videos found. All videos are already optimized.",
        queued: 0,
      });
    }

    // Validate files exist on disk and queue them
    const queued: { id: string; title: string }[] = [];
    const skipped: { id: string; title: string; reason: string }[] = [];

    for (const video of videos) {
      if (!video.videoUrl) {
        skipped.push({ id: video.id, title: video.title, reason: "No video URL" });
        continue;
      }

      const rawPath = video.videoUrl.startsWith("/") ? video.videoUrl.slice(1) : video.videoUrl;
      const absolutePath = path.join(process.cwd(), rawPath);

      if (!existsSync(absolutePath)) {
        skipped.push({ id: video.id, title: video.title, reason: "File not found on disk" });
        continue;
      }

      // Mark as PROCESSING
      await prisma.video.update({
        where: { id: video.id },
        data: { status: "PROCESSING" },
      });

      // Kick off background processing (non-blocking)
      processVideo(video.id, rawPath).catch((err) => {
        console.error(`Reprocess failed for video ${video.id}:`, err);
      });

      queued.push({ id: video.id, title: video.title });
    }

    return NextResponse.json({
      message: `Queued ${queued.length} video(s) for reprocessing. ${skipped.length} skipped.`,
      queued,
      skipped,
    });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (error?.message === "Forbidden" || error?.message === "Device not allowed") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("Reprocess videos error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
