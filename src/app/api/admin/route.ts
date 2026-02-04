import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOwnerWithDevice } from "@/lib/auth";

export async function GET() {
  try {
    await requireOwnerWithDevice();

    const [
      totalUsers,
      totalVideos,
      totalCreditsResult,
      totalRevenueResult,
      recentAlerts,
      bannedUsers,
      verifiedUsers,
      activeStreams,
      unreadAlertCount,
      unreadFraudCount,
      pendingFeesResult,
      settledFeesCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.video.count(),
      prisma.wallet.aggregate({ _sum: { credits: true } }),
      prisma.wallet.aggregate({ _sum: { totalEarned: true } }),
      prisma.notification.findMany({
        where: { type: "SYSTEM" },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { user: { select: { username: true, displayName: true } } },
      }),
      prisma.user.count({ where: { isBanned: true } }),
      prisma.user.count({ where: { verifiedBadge: true } }),
      prisma.liveStream.count({ where: { status: "LIVE" } }),
      prisma.notification.count({ where: { read: false } }),
      prisma.notification.count({
        where: { read: false, type: "SYSTEM", message: { contains: "FRAUD" } },
      }),
      prisma.creditLedger.aggregate({
        where: { type: "PLATFORM_FEE_PENDING" },
        _sum: { deltaCredits: true },
      }),
      prisma.creditLedger.count({
        where: { type: "PLATFORM_FEE_SETTLED" },
      }),
    ]);

    return NextResponse.json({
      stats: {
        totalUsers,
        totalVideos,
        totalCredits: totalCreditsResult._sum.credits ?? 0,
        totalRevenue: totalRevenueResult._sum.totalEarned ?? 0,
        bannedUsers,
        verifiedUsers,
        activeStreams,
        pendingFees: pendingFeesResult._sum.deltaCredits ?? 0,
        settledFees: settledFeesCount,
      },
      recentAlerts,
      unreadAlertCount,
      unreadFraudCount,
    });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (error?.message === "Forbidden" || error?.message === "Device not allowed") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("Admin stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
