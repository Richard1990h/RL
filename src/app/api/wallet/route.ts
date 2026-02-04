import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const currentUser = await requireAuth();

    const wallet = await prisma.wallet.findUnique({
      where: { userId: currentUser.id },
    });

    if (!wallet) {
      return NextResponse.json(
        { error: "Wallet not found" },
        { status: 404 }
      );
    }

    // Get recent transactions
    const transactions = await prisma.transaction.findMany({
      where: { userId: currentUser.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({
      wallet: {
        // Credits are the only stored value. USD is derived (1 credit = $0.01).
        credits: wallet.credits,
        totalEarned: wallet.totalEarned,
        totalSpent: wallet.totalSpent,
      },
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amountCents: t.amountCents,
        credits: t.credits,
        description: t.description,
        status: t.status,
        createdAt: t.createdAt,
      })),
    });
  } catch (error: any) {
    if (error?.status === 401) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Get wallet error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
