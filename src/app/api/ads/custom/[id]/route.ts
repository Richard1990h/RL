import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { insertLedgerEntries } from "@/lib/credit-ledger";
import { getTreasuryUserId } from "@/lib/treasury";

// PATCH: Admin approve/reject, or user add credits / pause / resume
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const ad = await prisma.customAd.findUnique({ where: { id } });
    if (!ad) {
      return NextResponse.json({ error: "Ad not found" }, { status: 404 });
    }

    const body = await request.json();

    // User adding credits to their own ad
    if (body.addCredits && typeof body.addCredits === "number" && body.addCredits > 0) {
      if (ad.userId !== user.id) {
        return NextResponse.json({ error: "Not your ad" }, { status: 403 });
      }

      const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
      if (!wallet || wallet.credits < body.addCredits) {
        return NextResponse.json(
          { error: `Insufficient credits. You have ${wallet?.credits ?? 0}.` },
          { status: 400 }
        );
      }

      const treasuryUserId = await getTreasuryUserId();
      const refId = `ad_topup_${id}_${Date.now()}`;
      const amount = body.addCredits;

      const updatedAd = await prisma.$transaction(async (tx) => {
        const result = await tx.customAd.update({
          where: { id },
          data: { creditsPaid: { increment: amount } },
        });

        await tx.transaction.create({
          data: {
            userId: user.id,
            type: "CREDIT_SPENT",
            amountCents: 0,
            credits: amount,
            description: `Added credits to custom ad: ${ad.title}`,
            status: "COMPLETED",
          },
        });

        // Double-entry: debit user, credit treasury
        await insertLedgerEntries(tx, [
          {
            userId: user.id,
            deltaCredits: -amount,
            type: "AD_PURCHASE",
            referenceId: refId,
            description: `Added credits to custom ad: ${ad.title}`,
          },
          {
            userId: treasuryUserId,
            deltaCredits: amount,
            type: "AD_PURCHASE",
            referenceId: `${refId}_treasury`,
            description: `Ad top-up revenue from ${user.username}: ${ad.title}`,
          },
        ]);

        await tx.wallet.update({
          where: { userId: user.id },
          data: { totalSpent: { increment: amount } },
        });
        await tx.wallet.update({
          where: { userId: treasuryUserId },
          data: { totalEarned: { increment: amount } },
        });

        return result;
      });

      return NextResponse.json({ ad: updatedAd });
    }

    const { status, rejectionReason, refund } = body;

    // Users can pause/resume their own approved ads
    if (ad.userId === user.id && status === "PAUSED" && ad.status === "APPROVED") {
      const updatedAd = await prisma.customAd.update({
        where: { id },
        data: { status: "PAUSED" },
      });
      return NextResponse.json({ ad: updatedAd });
    }
    if (ad.userId === user.id && status === "APPROVED" && ad.status === "PAUSED") {
      const updatedAd = await prisma.customAd.update({
        where: { id },
        data: { status: "APPROVED" },
      });
      return NextResponse.json({ ad: updatedAd });
    }

    // Admin actions: approve, reject, pause any ad
    if (!user.isOwner) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    if (status === "APPROVED") {
      const updatedAd = await prisma.customAd.update({
        where: { id },
        data: { status: "APPROVED" },
      });
      return NextResponse.json({ ad: updatedAd });
    }

    if (status === "REJECTED") {
      if (refund && ad.creditsPaid > 0) {
        // Refund credits: debit treasury, credit user
        const refundAmount = ad.creditsPaid;
        const treasuryUserId = await getTreasuryUserId();
        const refId = `ad_refund_${id}_${Date.now()}`;

        const updatedAd = await prisma.$transaction(async (tx) => {
          const result = await tx.customAd.update({
            where: { id },
            data: {
              status: "REJECTED",
              rejectionReason: rejectionReason || null,
              creditsPaid: 0,
            },
          });

          await tx.transaction.create({
            data: {
              userId: ad.userId,
              type: "CREDIT_EARNED",
              amountCents: 0,
              credits: refundAmount,
              description: `Refund for rejected ad: ${ad.title}`,
              status: "COMPLETED",
            },
          });

          // Double-entry: debit treasury, credit user
          await insertLedgerEntries(tx, [
            {
              userId: treasuryUserId,
              deltaCredits: -refundAmount,
              type: "AD_REFUND",
              referenceId: refId,
              description: `Ad refund to ${ad.userId}: ${ad.title}`,
            },
            {
              userId: ad.userId,
              deltaCredits: refundAmount,
              type: "AD_REFUND",
              referenceId: `${refId}_user`,
              description: `Refund for rejected ad: ${ad.title}`,
            },
          ]);

          await tx.wallet.update({
            where: { userId: treasuryUserId },
            data: { totalEarned: { decrement: refundAmount } },
          });
          await tx.wallet.update({
            where: { userId: ad.userId },
            data: { totalSpent: { decrement: refundAmount } },
          });

          return result;
        });

        return NextResponse.json({ ad: updatedAd });
      } else {
        const updatedAd = await prisma.customAd.update({
          where: { id },
          data: {
            status: "REJECTED",
            rejectionReason: rejectionReason || null,
          },
        });
        return NextResponse.json({ ad: updatedAd });
      }
    }

    if (status === "PAUSED") {
      const updatedAd = await prisma.customAd.update({
        where: { id },
        data: { status: "PAUSED" },
      });
      return NextResponse.json({ ad: updatedAd });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("PATCH /api/ads/custom/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE: User deletes own ad (with credit refund for remaining), admin can delete any
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const ad = await prisma.customAd.findUnique({ where: { id } });
    if (!ad) {
      return NextResponse.json({ error: "Ad not found" }, { status: 404 });
    }

    // Only the owner of the ad or an admin can delete
    if (ad.userId !== user.id && !user.isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const refundAmount = ad.creditsPaid;

    if (refundAmount > 0) {
      const treasuryUserId = await getTreasuryUserId();
      const refId = `ad_cancel_${id}_${Date.now()}`;

      await prisma.$transaction(async (tx) => {
        await tx.customAd.delete({ where: { id } });

        await tx.transaction.create({
          data: {
            userId: ad.userId,
            type: "CREDIT_EARNED",
            amountCents: 0,
            credits: refundAmount,
            description: `Refund for cancelled ad: ${ad.title}`,
            status: "COMPLETED",
          },
        });

        // Double-entry: debit treasury, credit user
        await insertLedgerEntries(tx, [
          {
            userId: treasuryUserId,
            deltaCredits: -refundAmount,
            type: "AD_REFUND",
            referenceId: refId,
            description: `Ad cancellation refund to ${ad.userId}: ${ad.title}`,
          },
          {
            userId: ad.userId,
            deltaCredits: refundAmount,
            type: "AD_REFUND",
            referenceId: `${refId}_user`,
            description: `Refund for cancelled ad: ${ad.title}`,
          },
        ]);

        await tx.wallet.update({
          where: { userId: treasuryUserId },
          data: { totalEarned: { decrement: refundAmount } },
        });
        await tx.wallet.update({
          where: { userId: ad.userId },
          data: { totalSpent: { decrement: refundAmount } },
        });
      });
    } else {
      await prisma.customAd.delete({ where: { id } });
    }

    return NextResponse.json({ success: true, refundedCredits: refundAmount });
  } catch (error) {
    console.error("DELETE /api/ads/custom/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
