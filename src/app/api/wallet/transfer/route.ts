import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { insertLedgerEntries } from "@/lib/credit-ledger";

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireAuth();

    const body = await req.json();
    const { toUserId, amount } = body;

    // Validate inputs
    if (!toUserId || typeof toUserId !== "string") {
      return NextResponse.json(
        { error: "toUserId is required and must be a string" },
        { status: 400 }
      );
    }

    if (!amount || typeof amount !== "number" || amount <= 0 || !Number.isInteger(amount)) {
      return NextResponse.json(
        { error: "amount must be a positive integer" },
        { status: 400 }
      );
    }

    if (toUserId === currentUser.id) {
      return NextResponse.json(
        { error: "Cannot transfer credits to yourself" },
        { status: 400 }
      );
    }

    // Verify receiver exists
    const receiver = await prisma.user.findUnique({
      where: { id: toUserId },
      select: { id: true, username: true },
    });

    if (!receiver) {
      return NextResponse.json(
        { error: "Recipient user not found" },
        { status: 404 }
      );
    }

    // Check sender wallet
    const senderWallet = await prisma.wallet.findUnique({
      where: { userId: currentUser.id },
    });

    if (!senderWallet) {
      return NextResponse.json(
        { error: "Sender wallet not found" },
        { status: 404 }
      );
    }

    if (senderWallet.credits < amount) {
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 400 }
      );
    }

    // Ensure receiver has a wallet
    await prisma.wallet.upsert({
      where: { userId: toUserId },
      update: {},
      create: { userId: toUserId },
    });

    // Double-entry transfer inside a single transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create Transaction records for both users
      const senderTx = await tx.transaction.create({
        data: {
          userId: currentUser.id,
          type: "CREDIT_TRANSFER",
          amountCents: 0,
          credits: -amount,
          description: `Transferred ${amount} credits to ${receiver.username}`,
          status: "COMPLETED",
          metadata: {
            toUserId,
            toUsername: receiver.username,
            type: "credit_transfer_sent",
          },
        },
      });

      await tx.transaction.create({
        data: {
          userId: toUserId,
          type: "CREDIT_TRANSFER",
          amountCents: 0,
          credits: amount,
          description: `Received ${amount} credits from ${currentUser.username}`,
          status: "COMPLETED",
          metadata: {
            fromUserId: currentUser.id,
            fromUsername: currentUser.username,
            type: "credit_transfer_received",
          },
        },
      });

      // Double-entry ledger: same referenceId for both rows
      // TRANSFER_OUT is processed first (debit) — race-safe conditional update
      // TRANSFER_IN is processed second (credit) — simple increment
      const transferId = senderTx.id;

      await insertLedgerEntries(tx, [
        {
          userId: currentUser.id,
          deltaCredits: -amount,
          type: "TRANSFER_OUT",
          referenceId: transferId,
          description: `Transfer to ${receiver.username}`,
        },
        {
          userId: toUserId,
          deltaCredits: amount,
          type: "TRANSFER_IN",
          referenceId: transferId,
          description: `Transfer from ${currentUser.username}`,
        },
      ]);

      return { senderTx, transferId };
    });

    // Get updated wallets
    const updatedSenderWallet = await prisma.wallet.findUnique({
      where: { userId: currentUser.id },
    });

    const updatedReceiverWallet = await prisma.wallet.findUnique({
      where: { userId: toUserId },
    });

    return NextResponse.json(
      {
        transfer: {
          transactionId: result.senderTx.id,
          transferId: result.transferId,
          amount,
          fromUserId: currentUser.id,
          toUserId,
        },
        senderWallet: {
          credits: updatedSenderWallet!.credits,
        },
        receiverWallet: {
          credits: updatedReceiverWallet!.credits,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error?.status === 401 || error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Transfer credits error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
