import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [videos, wallet, liveStreams, followers] = await Promise.all([
      prisma.video.findMany({
        where: { creatorId: user.id },
        orderBy: { uploadDate: "desc" },
      }),
      prisma.wallet.findUnique({ where: { userId: user.id } }),
      prisma.liveStream.findMany({
        where: { hostId: user.id },
        include: { _count: { select: { participants: true, chatMessages: true } } },
        orderBy: { startedAt: "desc" },
      }),
      prisma.follow.count({ where: { followingId: user.id } }),
    ]);

    // Aggregate video stats
    const totalViews = videos.reduce((sum, v) => sum + v.views, 0);
    const totalImpressions = videos.reduce((sum, v) => sum + (v.impressions || 0), 0);
    const totalLikes = videos.reduce((sum, v) => sum + v.likes, 0);
    const totalDislikes = videos.reduce((sum, v) => sum + v.dislikes, 0);

    // Views by month (last 12 months)
    const viewsByMonth: number[] = new Array(12).fill(0);
    const monthLabels: string[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthLabels.push(d.toLocaleString("en-US", { month: "short" }));
    }

    // Distribute impressions roughly across months based on upload date
    for (const v of videos) {
      const uploadMonth = v.uploadDate ? new Date(v.uploadDate).getMonth() : now.getMonth();
      const monthsAgo = (now.getFullYear() * 12 + now.getMonth()) - (new Date(v.uploadDate || now).getFullYear() * 12 + uploadMonth);
      const idx = 11 - Math.min(monthsAgo, 11);
      viewsByMonth[idx] += v.impressions || v.views;
    }

    // Revenue from wallet
    const totalEarnedCents = wallet?.totalEarned || 0;

    // Top live streams
    const topStreams = liveStreams.slice(0, 5).map((s) => ({
      title: s.title,
      date: s.startedAt ? new Date(s.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "N/A",
      peak: s.peakViewers || 0,
      participants: s._count.participants,
      chatMessages: s._count.chatMessages,
    }));

    return NextResponse.json({
      totalViews,
      totalImpressions,
      totalLikes,
      totalDislikes,
      totalVideos: videos.length,
      followers,
      totalEarnedCents,
      viewsByMonth,
      monthLabels,
      topStreams,
      liveStreamCount: liveStreams.length,
    });
  } catch (error) {
    console.error("Analytics error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
