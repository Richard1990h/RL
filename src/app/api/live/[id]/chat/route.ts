import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { insertLedgerEntries } from "@/lib/credit-ledger";

// GET: Get recent chat messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const before = searchParams.get("before");

    const liveStream = await prisma.liveStream.findUnique({ where: { id } });
    if (!liveStream) {
      return NextResponse.json({ error: "Live stream not found" }, { status: 404 });
    }

    const where: Record<string, unknown> = {
      liveStreamId: id,
    };

    if (before) {
      where.createdAt = { lt: new Date(before) };
    }

    const messages = await prisma.liveChatMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Fetch user info for messages
    const userIds = [...new Set(messages.map((m) => m.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    const result = messages.reverse().map((msg) => ({
      ...msg,
      user: userMap.get(msg.userId) || null,
    }));

    return NextResponse.json({ messages: result });
  } catch (error) {
    console.error("GET /api/live/[id]/chat error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: Send chat message
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { text, isDonation, creditAmount } = body;

    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const liveStream = await prisma.liveStream.findUnique({ where: { id } });
    if (!liveStream) {
      return NextResponse.json({ error: "Live stream not found" }, { status: 404 });
    }

    if (liveStream.status !== "LIVE") {
      return NextResponse.json({ error: "Live stream is not active" }, { status: 400 });
    }

    // Check if the stream host has blocked the sender
    const block = await prisma.block.findFirst({
      where: {
        blockerId: liveStream.hostId,
        blockedId: user.id,
      },
    });
    if (block) {
      return NextResponse.json({ error: "Cannot send messages to this user" }, { status: 403 });
    }

    // Handle donation
    const MAX_DONATION = 100000;
    if (isDonation && creditAmount && creditAmount > 0) {
      if (typeof creditAmount !== "number" || !Number.isInteger(creditAmount) || creditAmount <= 0 || creditAmount > MAX_DONATION) {
        return NextResponse.json({ error: `Credits must be a positive integer up to ${MAX_DONATION}` }, { status: 400 });
      }
      const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
      if (!wallet || wallet.credits < creditAmount) {
        return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
      }

      // Execute donation + chat message atomically — double-entry ledger
      const chatMessage = await prisma.$transaction(async (tx) => {
        // Ensure host wallet exists
        await tx.wallet.upsert({
          where: { userId: liveStream.hostId },
          update: {},
          create: { userId: liveStream.hostId },
        });

        // Apply host cut (default 80% to host, 20% platform)
        const hostCutPct = liveStream.hostCutPercent ?? 80;
        const hostShare = Math.floor(creditAmount * hostCutPct / 100);
        const platformShare = creditAmount - hostShare;

        // Create transaction records
        const senderTx = await tx.transaction.create({
          data: {
            userId: user.id,
            type: "DONATION",
            amountCents: 0,
            credits: creditAmount,
            description: `Donation in live stream: ${liveStream.title}`,
            status: "COMPLETED",
          },
        });

        await tx.transaction.create({
          data: {
            userId: liveStream.hostId,
            type: "CREDIT_EARNED",
            amountCents: 0,
            credits: hostShare,
            description: `Donation received from ${user.username} in live stream (${hostCutPct}% of ${creditAmount})`,
            status: "COMPLETED",
          },
        });

        // Double-entry ledger
        const ledgerEntries = [
          {
            userId: user.id,
            deltaCredits: -creditAmount,
            type: "DONATION_OUT" as const,
            referenceId: senderTx.id,
            description: `Live donation to ${liveStream.title}`,
          },
          {
            userId: liveStream.hostId,
            deltaCredits: hostShare,
            type: "DONATION_IN" as const,
            referenceId: senderTx.id,
            description: `Live donation from ${user.username}`,
          },
        ];

        // Platform share to treasury if applicable
        if (platformShare > 0) {
          const { getTreasuryUserId } = await import("@/lib/treasury");
          const treasuryUserId = await getTreasuryUserId();
          ledgerEntries.push({
            userId: treasuryUserId,
            deltaCredits: platformShare,
            type: "PLATFORM_FEE" as const,
            referenceId: senderTx.id,
            description: `Platform share from live donation`,
          });
          await tx.wallet.update({
            where: { userId: treasuryUserId },
            data: { totalEarned: { increment: platformShare } },
          });
        }

        await insertLedgerEntries(tx, ledgerEntries);

        // Update totalSpent/totalEarned
        await tx.wallet.update({
          where: { userId: user.id },
          data: { totalSpent: { increment: creditAmount } },
        });
        await tx.wallet.update({
          where: { userId: liveStream.hostId },
          data: { totalEarned: { increment: hostShare } },
        });

        // Create chat message inside the transaction
        return tx.liveChatMessage.create({
          data: {
            liveStreamId: id,
            userId: user.id,
            text,
            isDonation: true,
            creditAmount: creditAmount || 0,
          },
        });
      });

      return NextResponse.json({
        message: {
          ...chatMessage,
          user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
          },
        },
      }, { status: 201 });
    }

    // Non-donation chat message
    const chatMessage = await prisma.liveChatMessage.create({
      data: {
        liveStreamId: id,
        userId: user.id,
        text,
        isDonation: false,
        creditAmount: 0,
      },
    });

    return NextResponse.json({
      message: {
        ...chatMessage,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        },
      },
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/live/[id]/chat error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
