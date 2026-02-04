import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const [creatorCount, viewsResult, earningsResult] = await Promise.all([
      prisma.user.count({ where: { isCreator: true } }),
      prisma.video.aggregate({ _sum: { views: true } }),
      prisma.wallet.aggregate({ _sum: { totalEarned: true } }),
    ]);

    return NextResponse.json({
      activeCreators: creatorCount,
      totalViews: viewsResult._sum.views || 0,
      totalPaidToCreators: earningsResult._sum.totalEarned || 0,
    });
  } catch (error) {
    console.error("Platform stats error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
