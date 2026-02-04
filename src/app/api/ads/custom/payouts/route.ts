import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOwnerWithDevice } from "@/lib/auth";
import { insertLedgerEntries } from "@/lib/credit-ledger";
import { getTreasuryUserId } from "@/lib/treasury";

// GET: Admin — list pending creator payouts from ad impressions
export async function GET() {
  try {
    await requireOwnerWithDevice();

    // Get all unpaid impression logs grouped by creator
    const unpaidLogs = await prisma.adImpressionLog.findMany({
      where: { paidOut: false, creatorId: { not: null } },
      include: {
        ad: { select: { title: true } },
        video: { select: { id: true, title: true } },
        creator: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, followerCount: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Group by creator
    const creatorMap: Record<string, {
      creator: { id: string; username: string; displayName: string | null; avatarUrl: string | null; followerCount: number };
      totalCredits: number;
      totalImpressions: number;
      sharePct: number;
      videos: Record<string, { videoId: string; videoTitle: string; impressions: number; credits: number }>;
      logIds: string[];
    }> = {};

    for (const log of unpaidLogs) {
      if (!log.creatorId || !log.creator) continue;
      if (!creatorMap[log.creatorId]) {
        creatorMap[log.creatorId] = {
          creator: log.creator,
          totalCredits: 0,
          totalImpressions: 0,
          sharePct: log.creatorSharePct,
          videos: {},
          logIds: [],
        };
      }
      const entry = creatorMap[log.creatorId];
      entry.totalCredits += log.creatorShareCredits;
      entry.totalImpressions += 1;
      entry.logIds.push(log.id);

      if (log.videoId && log.video) {
        if (!entry.videos[log.videoId]) {
          entry.videos[log.videoId] = {
            videoId: log.videoId,
            videoTitle: log.video.title,
            impressions: 0,
            credits: 0,
          };
        }
        entry.videos[log.videoId].impressions += 1;
        entry.videos[log.videoId].credits += log.creatorShareCredits;
      }
    }

    const payouts = Object.values(creatorMap).map((entry) => ({
      ...entry,
      videos: Object.values(entry.videos),
    }));

    // Also get recent paid-out history
    const recentPayouts = await prisma.creditLedger.findMany({
      where: { type: "AD_CREATOR_PAYOUT" },
      include: { user: { select: { id: true, username: true, displayName: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Get payout settings
    const settings = await prisma.platformSettings.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });

    return NextResponse.json({
      pendingPayouts: payouts,
      recentPayouts,
      adPayoutDay: settings.adPayoutDay,
    });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (error?.message === "Forbidden" || error?.message === "Device not allowed") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("GET /api/ads/custom/payouts error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: Admin — pay out a specific creator's pending ad revenue
export async function POST(request: NextRequest) {
  try {
    await requireOwnerWithDevice();

    const body = await request.json();
    const { creatorId } = body;

    if (!creatorId) {
      return NextResponse.json({ error: "creatorId is required" }, { status: 400 });
    }

    // Get all unpaid logs for this creator
    const unpaidLogs = await prisma.adImpressionLog.findMany({
      where: { paidOut: false, creatorId },
    });

    if (unpaidLogs.length === 0) {
      return NextResponse.json({ error: "No pending payouts for this creator" }, { status: 400 });
    }

    const totalPayout = unpaidLogs.reduce((sum, log) => sum + log.creatorShareCredits, 0);

    if (totalPayout <= 0) {
      return NextResponse.json({ error: "Nothing to pay out" }, { status: 400 });
    }

    const treasuryUserId = await getTreasuryUserId();
    const refId = `ad_payout_${creatorId}_${Date.now()}`;
    const logIds = unpaidLogs.map((l) => l.id);

    // Pay the creator from treasury
    await prisma.$transaction(async (tx) => {
      // Mark all logs as paid
      await tx.adImpressionLog.updateMany({
        where: { id: { in: logIds } },
        data: { paidOut: true, paidOutAt: new Date() },
      });

      // Create transaction record
      await tx.transaction.create({
        data: {
          userId: creatorId,
          type: "AD_REVENUE",
          amountCents: 0,
          credits: totalPayout,
          description: `Ad revenue payout: ${unpaidLogs.length} impressions`,
          status: "COMPLETED",
        },
      });

      // Double-entry: debit treasury, credit creator
      await insertLedgerEntries(tx, [
        {
          userId: treasuryUserId,
          deltaCredits: -totalPayout,
          type: "AD_CREATOR_PAYOUT",
          referenceId: refId,
          description: `Ad payout to creator ${creatorId}: ${unpaidLogs.length} impressions`,
        },
        {
          userId: creatorId,
          deltaCredits: totalPayout,
          type: "AD_CREATOR_PAYOUT",
          referenceId: `${refId}_creator`,
          description: `Ad revenue payout: ${unpaidLogs.length} impressions`,
        },
      ]);
    });

    return NextResponse.json({
      success: true,
      creatorId,
      totalPayout,
      impressionsPaid: unpaidLogs.length,
    });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (error?.message === "Forbidden" || error?.message === "Device not allowed") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("POST /api/ads/custom/payouts error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT: Admin — update payout day setting
export async function PUT(request: NextRequest) {
  try {
    await requireOwnerWithDevice();

    const body = await request.json();
    const { adPayoutDay } = body;

    if (typeof adPayoutDay !== "number" || adPayoutDay < 0 || adPayoutDay > 28) {
      return NextResponse.json({ error: "adPayoutDay must be 0-28 (0 = manual only)" }, { status: 400 });
    }

    await prisma.platformSettings.upsert({
      where: { id: "singleton" },
      update: { adPayoutDay },
      create: { id: "singleton", adPayoutDay },
    });

    return NextResponse.json({ adPayoutDay });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (error?.message === "Forbidden" || error?.message === "Device not allowed") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("PUT /api/ads/custom/payouts error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
