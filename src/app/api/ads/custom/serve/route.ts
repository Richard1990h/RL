import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTreasuryUserId } from "@/lib/treasury";
import { checkRateLimit } from "@/lib/rate-limit";

function calculateRevenueSharePct(followerCount: number): number {
  if (followerCount >= 20000) return 80;
  if (followerCount >= 10000) return 50;
  return 10;
}

// GET: Returns a random approved custom ad as VAST XML for the IMA SDK
export async function GET(request: NextRequest) {
  // IP-based rate limiting: 30 requests per minute
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(`ad_serve:${ip}`, 30, 60_000)) {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><VAST version="3.0"/>`,
      { headers: { "Content-Type": "application/xml" }, status: 429 }
    );
  }

  try {
    const now = new Date();
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("videoId");

    // Get platform settings for cost per impression and min balance
    const settings = await prisma.platformSettings.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });
    const costPerImpression = settings.customAdCostPerImpression;
    const minBalance = settings.customAdMinBalance;

    // Find all approved, non-expired ads with enough credits
    const ads = await prisma.customAd.findMany({
      where: {
        status: "APPROVED",
        creditsPaid: { gte: Math.max(costPerImpression, minBalance) },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
    });

    // Filter out ads that have hit their max impressions (if set)
    const eligible = ads.filter(
      (ad) => ad.maxImpressions === 0 || ad.impressions < ad.maxImpressions
    );

    if (eligible.length === 0) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><VAST version="3.0"/>`,
        { headers: { "Content-Type": "application/xml" } }
      );
    }

    // Weighted random selection by credits remaining
    const totalWeight = eligible.reduce((sum, ad) => sum + ad.creditsPaid, 0);
    let rand = Math.random() * totalWeight;
    let selected = eligible[0];
    for (const ad of eligible) {
      rand -= ad.creditsPaid;
      if (rand <= 0) {
        selected = ad;
        break;
      }
    }

    // Look up the video and its creator for revenue splitting
    let creatorId: string | null = null;
    let creatorSharePct = 0;
    let creatorShareCredits = 0;
    let platformShareCredits = costPerImpression;

    if (videoId) {
      const video = await prisma.video.findUnique({
        where: { id: videoId },
        select: {
          creatorId: true,
          creator: {
            select: {
              followerCount: true,
              adSettings: { select: { revenueSharePct: true } },
            },
          },
        },
      });

      if (video) {
        creatorId = video.creatorId;
        // Use follower-based share calculation
        creatorSharePct = calculateRevenueSharePct(video.creator.followerCount);
        creatorShareCredits = Math.floor(costPerImpression * creatorSharePct / 100);
        platformShareCredits = costPerImpression - creatorShareCredits;
      }
    }

    const treasuryUserId = await getTreasuryUserId();

    // Atomic: deduct from ad, log impression, credit platform share to treasury
    await prisma.$transaction([
      // Deduct credits from the ad and increment impressions
      prisma.customAd.update({
        where: { id: selected.id },
        data: {
          impressions: { increment: 1 },
          creditsPaid: { decrement: costPerImpression },
        },
      }),
      // Log the impression with full revenue split details
      prisma.adImpressionLog.create({
        data: {
          adId: selected.id,
          videoId: videoId || null,
          creatorId: creatorId,
          totalCredits: costPerImpression,
          creatorShareCredits,
          platformShareCredits,
          creatorSharePct,
        },
      }),
      // Credit platform's share to treasury immediately
      prisma.wallet.update({
        where: { userId: treasuryUserId },
        data: {
          credits: { increment: platformShareCredits },
          totalEarned: { increment: platformShareCredits },
        },
      }),
      prisma.creditLedger.create({
        data: {
          userId: treasuryUserId,
          deltaCredits: platformShareCredits,
          type: "AD_IMPRESSION_EARNING",
          referenceId: `ad_imp_platform_${selected.id}_${Date.now()}`,
          description: `Platform share: ad impression on ${videoId || "unknown"}`,
        },
      }),
    ]);

    // Build VAST XML with skipoffset after 10 seconds
    const vastXml = `<?xml version="1.0" encoding="UTF-8"?>
<VAST version="3.0">
  <Ad id="${selected.id}">
    <InLine>
      <AdSystem>Rally Live Custom Ads</AdSystem>
      <AdTitle>${escapeXml(selected.title)}</AdTitle>
      <Impression><![CDATA[/api/ads/custom/serve?track=impression&id=${selected.id}]]></Impression>
      <Creatives>
        <Creative>
          <Linear skipoffset="00:00:10">
            <Duration>${formatDuration(selected.durationSec)}</Duration>
            <MediaFiles>
              <MediaFile delivery="progressive" type="video/mp4" width="1920" height="1080">
                <![CDATA[${selected.videoUrl}]]>
              </MediaFile>
            </MediaFiles>
          </Linear>
        </Creative>
      </Creatives>
    </InLine>
  </Ad>
</VAST>`;

    return new NextResponse(vastXml, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("GET /api/ads/custom/serve error:", error);
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><VAST version="3.0"/>`,
      { headers: { "Content-Type": "application/xml" } }
    );
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatDuration(seconds: number): string {
  const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
