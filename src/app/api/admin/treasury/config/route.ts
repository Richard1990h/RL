import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOwnerWithDevice } from "@/lib/auth";

export async function PUT(req: NextRequest) {
  try {
    await requireOwnerWithDevice();

    const body = await req.json();
    const { withdrawalFeePct, withdrawalFeeMinCents, purchaseFeePct } = body;

    if (
      typeof withdrawalFeePct !== "number" ||
      !Number.isInteger(withdrawalFeePct) ||
      withdrawalFeePct < 0 ||
      withdrawalFeePct > 50
    ) {
      return NextResponse.json(
        { error: "withdrawalFeePct must be an integer between 0 and 50" },
        { status: 400 }
      );
    }

    if (
      typeof withdrawalFeeMinCents !== "number" ||
      !Number.isInteger(withdrawalFeeMinCents) ||
      withdrawalFeeMinCents < 0 ||
      withdrawalFeeMinCents > 10000
    ) {
      return NextResponse.json(
        { error: "withdrawalFeeMinCents must be an integer between 0 and 10000" },
        { status: 400 }
      );
    }

    if (
      typeof purchaseFeePct !== "number" ||
      !Number.isInteger(purchaseFeePct) ||
      purchaseFeePct < 0 ||
      purchaseFeePct > 50
    ) {
      return NextResponse.json(
        { error: "purchaseFeePct must be an integer between 0 and 50" },
        { status: 400 }
      );
    }

    const settings = await prisma.platformSettings.upsert({
      where: { id: "singleton" },
      update: { withdrawalFeePct, withdrawalFeeMinCents, purchaseFeePct },
      create: { id: "singleton", withdrawalFeePct, withdrawalFeeMinCents, purchaseFeePct },
    });

    return NextResponse.json(settings);
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (error?.message === "Forbidden" || error?.message === "Device not allowed") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("Fee config update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
