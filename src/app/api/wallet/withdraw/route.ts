import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { insertLedgerEntry } from "@/lib/credit-ledger";
import { getTreasuryUserId } from "@/lib/treasury";

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireAuth();

    const body = await req.json();
    const { credits } = body;

    if (!credits || typeof credits !== "number" || credits <= 0 || !Number.isInteger(credits)) {
      return NextResponse.json(
        { error: "credits must be a positive integer" },
        { status: 400 }
      );
    }

    // Minimum 500 credits ($5.00)
    if (credits < 500) {
      return NextResponse.json(
        { error: "Minimum withdrawal is 500 credits ($5.00)" },
        { status: 400 }
      );
    }

    // Derive USD from credits at withdrawal time (1 credit = $0.01 = 1 cent)
    const grossAmountCents = credits;

    // Read fee config from PlatformSettings (or defaults)
    const feeConfig = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });
    const feePct = feeConfig?.withdrawalFeePct ?? 2;
    const feeMin = feeConfig?.withdrawalFeeMinCents ?? 25;

    // If owner, skip fee entirely
    const isOwner = currentUser.isOwner === true;
    const feeCents = isOwner ? 0 : Math.max(Math.ceil(grossAmountCents * (feePct / 100)), feeMin);
    const netAmountCents = grossAmountCents - feeCents;

    if (netAmountCents <= 0) {
      return NextResponse.json(
        { error: "Amount too small after fees" },
        { status: 400 }
      );
    }

    // Check wallet
    const wallet = await prisma.wallet.findUnique({
      where: { userId: currentUser.id },
    });

    if (!wallet) {
      return NextResponse.json(
        { error: "Wallet not found" },
        { status: 404 }
      );
    }

    if (wallet.credits < credits) {
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 400 }
      );
    }

    // Get user email for PayPal
    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { email: true },
    });

    // Resolve treasury user for fee crediting
    const treasuryUserId = isOwner ? null : await getTreasuryUserId();

    // Create withdrawal transaction — atomic debit via ledger
    const transaction = await prisma.$transaction(async (tx) => {
      const txRecord = await tx.transaction.create({
        data: {
          userId: currentUser.id,
          type: "WITHDRAWAL",
          amountCents: grossAmountCents,
          credits: -credits,
          description: `Withdrew ${credits} credits ($${(netAmountCents / 100).toFixed(2)} after fees) to PayPal (${user!.email})`,
          status: "PENDING",
          metadata: {
            creditsWithdrawn: credits,
            grossAmount: grossAmountCents,
            fee: feeCents,
            feeCredits: feeCents,
            netAmount: netAmountCents,
            paypalEmail: user!.email,
            method: "paypal",
            treasuryUserId: treasuryUserId ?? null,
          },
        },
      });

      // Ledger entry: race-safe conditional debit (credits >= needed)
      await insertLedgerEntry(tx, {
        userId: currentUser.id,
        deltaCredits: -credits,
        type: "WITHDRAW",
        referenceId: txRecord.id,
        description: `Withdrew ${credits} credits ($${(netAmountCents / 100).toFixed(2)} after fees)`,
      });

      // Credit fee to admin wallet (skip if owner or zero fee)
      if (feeCents > 0 && treasuryUserId) {
        await insertLedgerEntry(tx, {
          userId: treasuryUserId,
          deltaCredits: feeCents,
          type: "PLATFORM_FEE_PENDING",
          referenceId: txRecord.id,
          description: `Platform fee from withdrawal by ${user!.email}`,
        });

        // Update admin totalEarned
        await tx.wallet.update({
          where: { userId: treasuryUserId },
          data: { totalEarned: { increment: feeCents } },
        });
      }

      return txRecord;
    });

    const updatedWallet = await prisma.wallet.findUnique({
      where: { userId: currentUser.id },
    });

    return NextResponse.json({
      transaction: {
        id: transaction.id,
        credits: transaction.credits,
        status: transaction.status,
        description: transaction.description,
      },
      fees: {
        feeCents,
        netAmountCents,
        creditsWithdrawn: credits,
      },
      paypalEmail: user!.email,
      wallet: {
        credits: updatedWallet!.credits,
      },
    }, { status: 201 });
  } catch (error: any) {
    if (error?.status === 401) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Withdraw error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
