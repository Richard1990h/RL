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
    const limit = parseInt(searchParams.get("limit") || "50", 10);
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

      // Execute donation atomically — double-entry ledger
      await prisma.$transaction(async (tx) => {
        // Ensure host wallet exists
        await tx.wallet.upsert({
          where: { userId: liveStream.hostId },
          update: {},
          create: { userId: liveStream.hostId },
        });

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
            credits: creditAmount,
            description: `Donation received from ${user.username} in live stream`,
            status: "COMPLETED",
          },
        });

        // Double-entry ledger
        await insertLedgerEntries(tx, [
          {
            userId: user.id,
            deltaCredits: -creditAmount,
            type: "DONATION_OUT",
            referenceId: senderTx.id,
            description: `Live donation to ${liveStream.title}`,
          },
          {
            userId: liveStream.hostId,
            deltaCredits: creditAmount,
            type: "DONATION_IN",
            referenceId: senderTx.id,
            description: `Live donation from ${user.username}`,
          },
        ]);

        // Update totalSpent/totalEarned separately
        await tx.wallet.update({
          where: { userId: user.id },
          data: { totalSpent: { increment: creditAmount } },
        });
        await tx.wallet.update({
          where: { userId: liveStream.hostId },
          data: { totalEarned: { increment: creditAmount } },
        });
      });
    }

    const chatMessage = await prisma.liveChatMessage.create({
      data: {
        liveStreamId: id,
        userId: user.id,
        text,
        isDonation: isDonation ?? false,
        creditAmount: isDonation ? (creditAmount || 0) : 0,
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
