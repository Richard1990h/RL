import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOwnerWithDevice } from "@/lib/auth";
import { getTreasuryUserId } from "@/lib/treasury";

export async function GET() {
  try {
    await requireOwnerWithDevice();

    const treasuryUserId = await getTreasuryUserId();

    const [
      creditsInCirculationResult,
      feesPendingResult,
      feesSettledCount,
      treasuryWallet,
      recentWithdrawals,
      feeConfig,
    ] = await Promise.all([
      prisma.wallet.aggregate({ _sum: { credits: true } }),
      prisma.creditLedger.aggregate({
        where: { type: "PLATFORM_FEE_PENDING" },
        _sum: { deltaCredits: true },
      }),
      prisma.creditLedger.count({
        where: { type: "PLATFORM_FEE_SETTLED" },
      }),
      prisma.wallet.findUnique({
        where: { userId: treasuryUserId },
      }),
      prisma.transaction.findMany({
        where: { type: "WITHDRAWAL" },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          user: {
            select: { username: true, displayName: true, email: true },
          },
        },
      }),
      prisma.platformSettings.findUnique({ where: { id: "singleton" } }),
    ]);

    return NextResponse.json({
      creditsInCirculation: creditsInCirculationResult._sum.credits ?? 0,
      feesPending: feesPendingResult._sum.deltaCredits ?? 0,
      feesSettled: feesSettledCount,
      treasuryBalance: treasuryWallet?.credits ?? 0,
      recentWithdrawals: recentWithdrawals.map((w) => ({
        id: w.id,
        user: w.user,
        credits: Math.abs(w.credits),
        fee: (w.metadata as any)?.fee ?? 0,
        net: (w.metadata as any)?.netAmount ?? 0,
        status: w.status,
        paypalEmail: (w.metadata as any)?.paypalEmail ?? null,
        createdAt: w.createdAt.toISOString(),
      })),
      feeConfig: feeConfig ?? { withdrawalFeePct: 2, withdrawalFeeMinCents: 25, purchaseFeePct: 5 },
    });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (error?.message === "Forbidden" || error?.message === "Device not allowed") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("Treasury stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
