import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

function calculateRevenueSharePct(followerCount: number): number {
  if (followerCount >= 20000) return 80;
  if (followerCount >= 10000) return 50;
  return 10;
}

// GET: Get ad settings for current user
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adSettings = await prisma.adSettings.findUnique({
      where: { userId: user.id },
    });

    if (!adSettings) {
      return NextResponse.json({
        adSettings: null,
        eligible: user.followerCount >= 10000,
        followerCount: user.followerCount,
        revenueSharePct: calculateRevenueSharePct(user.followerCount),
      });
    }

    return NextResponse.json({
      adSettings,
      eligible: user.followerCount >= 10000,
      followerCount: user.followerCount,
      revenueSharePct: calculateRevenueSharePct(user.followerCount),
    });
  } catch (error) {
    console.error("GET /api/ads/settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT: Update ad settings
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.followerCount < 10000) {
      return NextResponse.json(
        { error: "Ad settings require at least 10,000 followers" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { adsPerVideo, adsPerLiveHour, creditsToSkip } = body;

    const revenueSharePct = calculateRevenueSharePct(user.followerCount);

    const adSettings = await prisma.adSettings.upsert({
      where: { userId: user.id },
      update: {
        ...(adsPerVideo !== undefined && { adsPerVideo }),
        ...(adsPerLiveHour !== undefined && { adsPerLiveHour }),
        ...(creditsToSkip !== undefined && { creditsToSkip }),
        revenueSharePct,
      },
      create: {
        userId: user.id,
        adsPerVideo: adsPerVideo ?? 1,
        adsPerLiveHour: adsPerLiveHour ?? 2,
        creditsToSkip: creditsToSkip ?? 200,
        revenueSharePct,
      },
    });

    return NextResponse.json({
      adSettings,
      revenueSharePct,
    });
  } catch (error) {
    console.error("PUT /api/ads/settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
