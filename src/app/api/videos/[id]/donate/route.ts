import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { insertLedgerEntries } from "@/lib/credit-ledger";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: videoId } = await params;
    const currentUser = await requireAuth();

    const body = await req.json();
    const { credits } = body;

    if (!credits || typeof credits !== "number" || credits <= 0 || !Number.isInteger(credits)) {
      return NextResponse.json(
        { error: "Credits must be a positive integer" },
        { status: 400 }
      );
    }

    // Check video exists
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: {
        creator: {
          select: { id: true, username: true, displayName: true },
        },
      },
    });

    if (!video || video.status === "DELETED") {
      return NextResponse.json(
        { error: "Video not found" },
        { status: 404 }
      );
    }

    if (video.creatorId === currentUser.id) {
      return NextResponse.json(
        { error: "You cannot donate to your own video" },
        { status: 400 }
      );
    }

    // Check sender has enough credits
    const senderWallet = await prisma.wallet.findUnique({
      where: { userId: currentUser.id },
    });

    if (!senderWallet || senderWallet.credits < credits) {
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 400 }
      );
    }

    // Process donation in a transaction — double-entry ledger
    await prisma.$transaction(async (tx) => {
      // Create transaction record for sender
      const senderTx = await tx.transaction.create({
        data: {
          userId: currentUser.id,
          type: "DONATION",
          amountCents: 0,
          credits: -credits,
          description: `Donated ${credits} credits to "${video.title}" by ${video.creator.displayName}`,
          status: "COMPLETED",
          metadata: {
            videoId: video.id,
            creatorId: video.creatorId,
          },
        },
      });

      // Create transaction record for creator
      await tx.transaction.create({
        data: {
          userId: video.creatorId,
          type: "CREDIT_EARNED",
          amountCents: 0,
          credits: credits,
          description: `Received ${credits} credits donation on "${video.title}"`,
          status: "COMPLETED",
          metadata: {
            videoId: video.id,
            donorId: currentUser.id,
          },
        },
      });

      // Double-entry ledger: DONATION_OUT (debit) + DONATION_IN (credit)
      await insertLedgerEntries(tx, [
        {
          userId: currentUser.id,
          deltaCredits: -credits,
          type: "DONATION_OUT",
          referenceId: senderTx.id,
          description: `Donated to "${video.title}"`,
        },
        {
          userId: video.creatorId,
          deltaCredits: credits,
          type: "DONATION_IN",
          referenceId: senderTx.id,
          description: `Donation from ${currentUser.username} on "${video.title}"`,
        },
      ]);

      // Update totalSpent/totalEarned separately
      await tx.wallet.update({
        where: { userId: currentUser.id },
        data: { totalSpent: { increment: credits } },
      });
      await tx.wallet.update({
        where: { userId: video.creatorId },
        data: { totalEarned: { increment: credits } },
      });
    });

    // Get updated sender wallet
    const updatedWallet = await prisma.wallet.findUnique({
      where: { userId: currentUser.id },
    });

    return NextResponse.json({
      message: `Successfully donated ${credits} credits`,
      creditsRemaining: updatedWallet!.credits,
    });
  } catch (error: any) {
    if (error?.status === 401) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Donate error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
