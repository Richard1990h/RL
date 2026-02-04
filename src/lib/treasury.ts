import { prisma } from "@/lib/db";

let cachedTreasuryUserId: string | null = null;

/**
 * Returns the userId of the platform owner (isOwner: true).
 * Cached in module scope after first call.
 * Accepts an optional transaction client for use inside $transaction.
 */
export async function getTreasuryUserId(tx?: any): Promise<string> {
  if (cachedTreasuryUserId) return cachedTreasuryUserId;

  const db = tx ?? prisma;
  const owner = await db.user.findFirst({
    where: { isOwner: true },
    select: { id: true },
  });

  if (!owner) {
    throw new Error("No platform owner (isOwner) user found");
  }

  const id: string = owner.id;
  cachedTreasuryUserId = id;
  return id;
}
