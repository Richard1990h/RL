import { prisma } from "@/lib/db";
import { insertLedgerEntries } from "@/lib/credit-ledger";

export const FIVEM_PLATFORM_FEE_PCT = Number(process.env.FIVEM_PLATFORM_FEE_PCT ?? 10);

export async function getPlatformOwnerUserId(): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM User
    WHERE isOwner = true
    ORDER BY createdAt ASC
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

export function splitWithPlatformFee(amount: number) {
  const platformCut = Math.floor((amount * FIVEM_PLATFORM_FEE_PCT) / 100);
  const ownerCut = Math.max(0, amount - platformCut);
  return { ownerCut, platformCut };
}

export async function payWithPlatformCut(params: {
  tx: Parameters<Parameters<import("@/generated/prisma").PrismaClient["$transaction"]>[0]>[0];
  payerUserId: string;
  ownerUserId: string;
  totalCredits: number;
  referenceId: string;
  description: string;
  payerUsername?: string;
}) {
  const { tx, payerUserId, ownerUserId, totalCredits, referenceId, description, payerUsername } = params;
  const { ownerCut, platformCut } = splitWithPlatformFee(totalCredits);
  const platformOwnerId = await getPlatformOwnerUserId();

  await tx.wallet.upsert({ where: { userId: payerUserId }, update: {}, create: { userId: payerUserId } });
  await tx.wallet.upsert({ where: { userId: ownerUserId }, update: {}, create: { userId: ownerUserId } });
  if (platformOwnerId && platformCut > 0) {
    await tx.wallet.upsert({ where: { userId: platformOwnerId }, update: {}, create: { userId: platformOwnerId } });
  }

  const entries: Array<{
    userId: string;
    deltaCredits: number;
    type: "SERVICE_PAYMENT" | "SERVICE_EARNING";
    referenceId: string;
    description: string;
  }> = [
    {
      userId: payerUserId,
      deltaCredits: -totalCredits,
      type: "SERVICE_PAYMENT",
      referenceId,
      description,
    },
    {
      userId: ownerUserId,
      deltaCredits: ownerCut,
      type: "SERVICE_EARNING",
      referenceId: `${referenceId}:owner`,
      description: `Owner share from ${payerUsername || "user"} payment`,
    },
  ];

  if (platformOwnerId && platformCut > 0) {
    entries.push({
      userId: platformOwnerId,
      deltaCredits: platformCut,
      type: "SERVICE_EARNING",
      referenceId: `${referenceId}:platform`,
      description: `Platform ${FIVEM_PLATFORM_FEE_PCT}% fee`,
    });
  }

  await insertLedgerEntries(tx, entries);
  return { ownerCut, platformCut };
}

