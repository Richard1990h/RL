import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { createHash } from "crypto";

function hashIp(ip: string, userAgent: string): string {
  return createHash("sha256")
    .update(`${ip}:${userAgent}`)
    .digest("hex")
    .slice(0, 64);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: videoId } = await params;

    // Get user (optional - anonymous views are tracked by IP)
    const user = await getCurrentUser();

    // Get IP and user-agent for anonymous dedup
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";
    const ipHash = hashIp(ip, userAgent);

    // Check if video exists
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true },
    });

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    // 24-hour window
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Check for existing view within 24h
    if (user) {
      const existingView = await prisma.videoView.findUnique({
        where: { videoId_userId: { videoId, userId: user.id } },
      });

      if (existingView && existingView.viewedAt > oneDayAgo) {
        return NextResponse.json({ counted: false });
      }

      // Upsert the view record
      await prisma.videoView.upsert({
        where: { videoId_userId: { videoId, userId: user.id } },
        update: { viewedAt: new Date() },
        create: { videoId, userId: user.id, ipHash },
      });
    } else {
      const existingView = await prisma.videoView.findUnique({
        where: { videoId_ipHash: { videoId, ipHash } },
      });

      if (existingView && existingView.viewedAt > oneDayAgo) {
        return NextResponse.json({ counted: false });
      }

      // Upsert the view record
      await prisma.videoView.upsert({
        where: { videoId_ipHash: { videoId, ipHash } },
        update: { viewedAt: new Date() },
        create: { videoId, ipHash },
      });
    }

    // Increment view count
    await prisma.video.update({
      where: { id: videoId },
      data: { views: { increment: 1 } },
    });

    return NextResponse.json({ counted: true });
  } catch (error) {
    console.error("View tracking error:", error);
    return NextResponse.json(
      { error: "Failed to track view" },
      { status: 500 }
    );
  }
}
