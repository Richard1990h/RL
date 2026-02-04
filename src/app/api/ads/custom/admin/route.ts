import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOwnerWithDevice } from "@/lib/auth";

// GET: Admin-only — list all custom ads with user info + settings
export async function GET(request: NextRequest) {
  try {
    await requireOwnerWithDevice();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // optional filter

    const where = status ? { status } : {};

    const ads = await prisma.customAd.findMany({
      where,
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const settings = await prisma.platformSettings.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });

    // Summary stats
    const totalImpressions = ads.reduce((sum, ad) => sum + ad.impressions, 0);
    const totalCreditsRemaining = ads.reduce((sum, ad) => sum + ad.creditsPaid, 0);
    const activeCount = ads.filter((a) => a.status === "APPROVED").length;
    const pendingCount = ads.filter((a) => a.status === "PENDING_REVIEW").length;

    return NextResponse.json({
      ads,
      stats: {
        totalAds: ads.length,
        activeCount,
        pendingCount,
        totalImpressions,
        totalCreditsRemaining,
      },
      settings: {
        customAdPriceCredits: settings.customAdPriceCredits,
        customAdCostPerImpression: settings.customAdCostPerImpression,
        customAdMinBalance: settings.customAdMinBalance,
        customAdMixPercent: settings.customAdMixPercent,
      },
    });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (error?.message === "Forbidden" || error?.message === "Device not allowed") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("GET /api/ads/custom/admin error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT: Admin — update custom ad settings
export async function PUT(request: NextRequest) {
  try {
    await requireOwnerWithDevice();

    const body = await request.json();
    const update: Record<string, number> = {};

    if (typeof body.customAdPriceCredits === "number" && body.customAdPriceCredits >= 0) {
      update.customAdPriceCredits = body.customAdPriceCredits;
    }
    if (typeof body.customAdCostPerImpression === "number" && body.customAdCostPerImpression >= 1) {
      update.customAdCostPerImpression = body.customAdCostPerImpression;
    }
    if (typeof body.customAdMinBalance === "number" && body.customAdMinBalance >= 0) {
      update.customAdMinBalance = body.customAdMinBalance;
    }
    if (typeof body.customAdMixPercent === "number" && body.customAdMixPercent >= 0 && body.customAdMixPercent <= 100) {
      update.customAdMixPercent = body.customAdMixPercent;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const settings = await prisma.platformSettings.upsert({
      where: { id: "singleton" },
      update,
      create: { id: "singleton", ...update },
    });

    return NextResponse.json({
      settings: {
        customAdPriceCredits: settings.customAdPriceCredits,
        customAdCostPerImpression: settings.customAdCostPerImpression,
        customAdMinBalance: settings.customAdMinBalance,
        customAdMixPercent: settings.customAdMixPercent,
      },
    });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (error?.message === "Forbidden" || error?.message === "Device not allowed") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("PUT /api/ads/custom/admin error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
