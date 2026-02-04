import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const video = await prisma.video.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        videoUrl: true,
        durationSec: true,
        creatorId: true,
      },
    });

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    // Only the creator can poll processing status
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.id !== video.creatorId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      id: video.id,
      status: video.status,
      videoUrl: video.videoUrl,
      durationSec: video.durationSec,
    });
  } catch (error) {
    console.error("Video status error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
