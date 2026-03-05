import { prisma } from "@/lib/db";
import { insertLedgerEntries } from "@/lib/credit-ledger";

const DAY_MS = 24 * 60 * 60 * 1000;

type SubscriptionRow = {
  id: string;
  userId: string;
  serverId: string;
  status: string;
  amountCents: number;
  nextBillingAt: Date;
};

export async function enforceFivemServerBilling(serverId: string): Promise<{ active: boolean; reason?: string }> {
  const rows = await prisma.$queryRaw<SubscriptionRow[]>`
    SELECT id, userId, serverId, status, amountCents, nextBillingAt
    FROM FivemWebsiteSubscription
    WHERE serverId = ${serverId}
    LIMIT 1
  `;
  const sub = rows[0];
  if (!sub) return { active: true };

  if (sub.status !== "ACTIVE") {
    await prisma.$executeRaw`
      UPDATE FivemServer
      SET isPublished = ${false}, updatedAt = ${new Date()}
      WHERE id = ${serverId}
    `;
    return { active: false, reason: "Subscription inactive" };
  }

  const now = new Date();
  if (sub.nextBillingAt > now) return { active: true };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.wallet.upsert({
        where: { userId: sub.userId },
        update: {},
        create: { userId: sub.userId },
      });

      const chargeTx = await tx.transaction.create({
        data: {
          userId: sub.userId,
          type: "SUBSCRIPTION",
          amountCents: sub.amountCents,
          credits: -sub.amountCents,
          description: `FiveM website 30-day renewal (${sub.amountCents} credits)`,
          status: "COMPLETED",
          metadata: { module: "fivem", type: "auto_renewal", subscriptionId: sub.id },
        },
      });

      await insertLedgerEntries(tx, [
        {
          userId: sub.userId,
          deltaCredits: -sub.amountCents,
          type: "SERVICE_PAYMENT",
          referenceId: `fivem-renewal:${sub.id}:${sub.nextBillingAt.toISOString()}`,
          description: `Auto renewal charge for FiveM website (${sub.amountCents} credits)`,
        },
      ]);

      const newNextBillingAt = new Date(sub.nextBillingAt.getTime() + 30 * DAY_MS);
      await tx.$executeRaw`
        UPDATE FivemWebsiteSubscription
        SET nextBillingAt = ${newNextBillingAt}, updatedAt = ${now}
        WHERE id = ${sub.id}
      `;

      await tx.$executeRaw`
        UPDATE FivemServer
        SET isPublished = ${true}, updatedAt = ${now}
        WHERE id = ${serverId}
      `;

      await tx.transaction.update({
        where: { id: chargeTx.id },
        data: { status: "COMPLETED" },
      });
    });

    return { active: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Insufficient credits")) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE FivemWebsiteSubscription
          SET status = ${"PAST_DUE"}, updatedAt = ${new Date()}
          WHERE id = ${sub.id}
        `;
        await tx.$executeRaw`
          UPDATE FivemServer
          SET isPublished = ${false}, updatedAt = ${new Date()}
          WHERE id = ${serverId}
        `;
      });
      return { active: false, reason: "Insufficient credits for renewal" };
    }
    throw error;
  }
}

export async function enforceDueFivemRenewals(limit = 25): Promise<void> {
  const dueRows = await prisma.$queryRaw<{ serverId: string }[]>`
    SELECT serverId
    FROM FivemWebsiteSubscription
    WHERE status = 'ACTIVE' AND nextBillingAt <= ${new Date()}
    ORDER BY nextBillingAt ASC
    LIMIT ${limit}
  `;

  for (const row of dueRows) {
    try {
      await enforceFivemServerBilling(row.serverId);
    } catch (error) {
      console.error("enforceDueFivemRenewals item failed:", error);
    }
  }
}
