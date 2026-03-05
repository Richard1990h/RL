import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureFivemTables, normalizeFivemSlug } from "@/lib/fivem/server-db";
import { FIVEM_PLATFORM_FEE_PCT, payWithPlatformCut } from "@/lib/fivem/fees";

type VipPackageRow = {
  packageId: string;
  serverId: string;
  ownerId: string;
  name: string;
  priceCredits: number;
  durationDays: number;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureFivemTables();
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug: rawSlug } = await params;
    const slug = normalizeFivemSlug(rawSlug);
    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    const packageId = String(body?.packageId || "").trim();
    if (!packageId) {
      return NextResponse.json({ error: "packageId is required" }, { status: 400 });
    }

    const rows = await prisma.$queryRaw<VipPackageRow[]>`
      SELECT p.id AS packageId, s.id AS serverId, s.ownerId, p.name, p.priceCredits, p.durationDays
      FROM FivemServerVipPackage p
      INNER JOIN FivemServer s ON s.id = p.serverId
      WHERE s.slug = ${slug} AND p.id = ${packageId} AND p.isActive = true
      LIMIT 1
    `;
    const vip = rows[0];
    if (!vip) {
      return NextResponse.json({ error: "VIP package not found" }, { status: 404 });
    }

    const purchaseIdRows = await prisma.$queryRaw<{ id: string }[]>`SELECT UUID() AS id`;
    const purchaseId = purchaseIdRows[0]?.id;
    if (!purchaseId) {
      return NextResponse.json({ error: "Unable to create purchase id" }, { status: 500 });
    }
    const now = new Date();
    const expiresAt = new Date(now.getTime() + vip.durationDays * 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      await tx.wallet.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id },
      });

      await tx.wallet.upsert({
        where: { userId: vip.ownerId },
        update: {},
        create: { userId: vip.ownerId },
      });

      const senderTx = await tx.transaction.create({
        data: {
          userId: user.id,
          type: "SERVICE_PAYMENT",
          amountCents: vip.priceCredits,
          credits: -vip.priceCredits,
          description: `FiveM VIP purchase: ${vip.name}`,
          status: "COMPLETED",
        },
      });

      await tx.transaction.create({
        data: {
          userId: vip.ownerId,
          type: "SERVICE_PAYOUT",
          amountCents: vip.priceCredits,
          credits: Math.floor((vip.priceCredits * (100 - FIVEM_PLATFORM_FEE_PCT)) / 100),
          description: `FiveM VIP sold: ${vip.name}`,
          status: "COMPLETED",
        },
      });

      await payWithPlatformCut({
        tx,
        payerUserId: user.id,
        ownerUserId: vip.ownerId,
        totalCredits: vip.priceCredits,
        referenceId: senderTx.id,
        description: `Purchased VIP ${vip.name}`,
        payerUsername: user.username,
      });

      await tx.$executeRaw`
        INSERT INTO FivemServerVipPurchase
        (id, serverId, packageId, userId, creditsPaid, startsAt, expiresAt, status, createdAt)
        VALUES
        (${purchaseId}, ${vip.serverId}, ${vip.packageId}, ${user.id}, ${vip.priceCredits}, ${now}, ${expiresAt}, ${"ACTIVE"}, ${now})
      `;
    });

    return NextResponse.json({
      ok: true,
      purchase: {
        id: purchaseId,
        packageId: vip.packageId,
        name: vip.name,
        creditsPaid: vip.priceCredits,
        expiresAt: expiresAt.toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message.includes("Insufficient credits")) {
      return NextResponse.json({ error: "Insufficient credits. Buy credits first in Wallet." }, { status: 402 });
    }
    console.error("POST /api/fivem/servers/[slug]/vip/buy error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
