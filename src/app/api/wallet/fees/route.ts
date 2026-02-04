import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const config = await prisma.platformSettings.findUnique({
      where: { id: "singleton" },
    });

    return NextResponse.json({
      withdrawalFeePct: config?.withdrawalFeePct ?? 2,
      withdrawalFeeMinCents: config?.withdrawalFeeMinCents ?? 25,
      purchaseFeePct: config?.purchaseFeePct ?? 5,
    });
  } catch {
    return NextResponse.json({
      withdrawalFeePct: 2,
      withdrawalFeeMinCents: 25,
      purchaseFeePct: 5,
    });
  }
}
