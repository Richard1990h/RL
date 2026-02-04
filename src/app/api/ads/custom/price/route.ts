import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET: Public endpoint returning current custom ad pricing info
export async function GET() {
  try {
    const settings = await prisma.platformSettings.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });

    return NextResponse.json({
      price: settings.customAdPriceCredits,
      costPerImpression: settings.customAdCostPerImpression,
      minBalance: settings.customAdMinBalance,
      mixPercent: settings.customAdMixPercent,
    });
  } catch (error) {
    console.error("GET /api/ads/custom/price error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
