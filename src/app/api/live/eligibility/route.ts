import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const REQUIRED_VIDEOS = 5;
const REQUIRED_VIEWS = 100;
const REQUIRED_LIKES = 50;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Owner and bug testers always eligible
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { isOwner: true, role: true },
    });

    if (fullUser?.isOwner || fullUser?.role === "BUG_TESTER") {
      return NextResponse.json({
        eligible: true,
        videos: REQUIRED_VIDEOS,
        views: REQUIRED_VIEWS,
        likes: REQUIRED_LIKES,
        requiredVideos: REQUIRED_VIDEOS,
        requiredViews: REQUIRED_VIEWS,
        requiredLikes: REQUIRED_LIKES,
      });
    }

    // Count user's published videos
    const videoCount = await prisma.video.count({
      where: {
        creatorId: user.id,
        status: { not: "DELETED" },
      },
    });

    // Sum total views across all user's videos
    const viewsResult = await prisma.video.aggregate({
      where: {
        creatorId: user.id,
        status: { not: "DELETED" },
      },
      _sum: {
        views: true,
      },
    });

    // Sum total likes across all user's videos
    const likesResult = await prisma.video.aggregate({
      where: {
        creatorId: user.id,
        status: { not: "DELETED" },
      },
      _sum: {
        likes: true,
      },
    });

    const totalViews = viewsResult._sum.views ?? 0;
    const totalLikes = likesResult._sum.likes ?? 0;
    const eligible = videoCount >= REQUIRED_VIDEOS && totalViews >= REQUIRED_VIEWS && totalLikes >= REQUIRED_LIKES;

    return NextResponse.json({
      eligible,
      videos: videoCount,
      views: totalViews,
      likes: totalLikes,
      requiredVideos: REQUIRED_VIDEOS,
      requiredViews: REQUIRED_VIEWS,
      requiredLikes: REQUIRED_LIKES,
    });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Eligibility check error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
