import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { insertLedgerEntries } from "@/lib/credit-ledger";
import { getTreasuryUserId } from "@/lib/treasury";

// GET: List current user's custom ads
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ads = await prisma.customAd.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ ads });
  } catch (error) {
    console.error("GET /api/ads/custom error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: Submit a new custom ad
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title, videoUrl, durationSec } = body;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!videoUrl || typeof videoUrl !== "string") {
      return NextResponse.json({ error: "Video URL is required" }, { status: 400 });
    }
    if (!durationSec || typeof durationSec !== "number" || durationSec < 5 || durationSec > 30) {
      return NextResponse.json({ error: "Duration must be between 5 and 30 seconds" }, { status: 400 });
    }

    // Get the ad price from platform settings
    const settings = await prisma.platformSettings.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });
    const price = settings.customAdPriceCredits;

    // Check wallet balance
    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet || wallet.credits < price) {
      return NextResponse.json(
        { error: `Insufficient credits. You need ${price} credits but have ${wallet?.credits ?? 0}.` },
        { status: 400 }
      );
    }

    const treasuryUserId = await getTreasuryUserId();
    const refId = `ad_submit_${Date.now()}`;

    // Deduct credits from user, credit to treasury, and create ad
    const ad = await prisma.$transaction(async (tx) => {
      const newAd = await tx.customAd.create({
        data: {
          userId: user.id,
          title: title.trim(),
          videoUrl,
          durationSec,
          creditsPaid: price,
          status: "PENDING_REVIEW",
        },
      });

      await tx.transaction.create({
        data: {
          userId: user.id,
          type: "CREDIT_SPENT",
          amountCents: 0,
          credits: price,
          description: `Custom ad submission: ${title.trim()}`,
          status: "COMPLETED",
        },
      });

      // Double-entry: debit user, credit treasury
      await insertLedgerEntries(tx, [
        {
          userId: user.id,
          deltaCredits: -price,
          type: "AD_PURCHASE",
          referenceId: refId,
          description: `Custom ad submission: ${title.trim()}`,
        },
        {
          userId: treasuryUserId,
          deltaCredits: price,
          type: "AD_PURCHASE",
          referenceId: `${refId}_treasury`,
          description: `Ad submission revenue from ${user.username}: ${title.trim()}`,
        },
      ]);

      // Update spending stats
      await tx.wallet.update({
        where: { userId: user.id },
        data: { totalSpent: { increment: price } },
      });
      await tx.wallet.update({
        where: { userId: treasuryUserId },
        data: { totalEarned: { increment: price } },
      });

      return newAd;
    });

    return NextResponse.json({ ad, price });
  } catch (error) {
    console.error("POST /api/ads/custom error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
