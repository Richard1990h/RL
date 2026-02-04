/**
 * Credit Ledger — Bank-grade helper for all credit mutations.
 *
 * Every credit change (purchase, transfer, spend, withdraw, admin grant, etc.)
 * MUST go through this module so that:
 *   1. A CreditLedger row is always created
 *   2. Wallet.credits is updated atomically in the same transaction
 *   3. No balance can go negative (race-safe conditional update)
 *   4. Idempotency is enforced via @@unique([type, referenceId])
 */

import type { LedgerEntryType } from "@/generated/prisma";

// Prisma interactive-transaction client type
type TxClient = Parameters<Parameters<import("@/generated/prisma").PrismaClient["$transaction"]>[0]>[0];

export interface LedgerEntry {
  userId: string;
  deltaCredits: number;   // positive = inflow, negative = outflow
  type: LedgerEntryType;
  referenceId: string;     // REQUIRED — always provide a unique reference
  description?: string;
}

/**
 * Insert a single ledger entry and atomically update Wallet.credits.
 * MUST be called inside a prisma.$transaction callback.
 *
 * For debits (negative delta), uses a conditional update:
 *   UPDATE wallet SET credits = credits + delta WHERE credits >= abs(delta)
 * If no rows match, the user has insufficient funds → throws.
 */
export async function insertLedgerEntry(
  tx: TxClient,
  entry: LedgerEntry
): Promise<void> {
  if (entry.deltaCredits === 0) return;

  // Insert ledger row (@@unique([type, referenceId]) enforces idempotency at DB level)
  await tx.creditLedger.create({
    data: {
      userId: entry.userId,
      deltaCredits: entry.deltaCredits,
      type: entry.type,
      referenceId: entry.referenceId,
      description: entry.description ?? null,
    },
  });

  if (entry.deltaCredits < 0) {
    // Atomic conditional debit — race-safe
    const needed = Math.abs(entry.deltaCredits);
    const result = await tx.$executeRawUnsafe(
      `UPDATE Wallet SET credits = credits - ? WHERE userId = ? AND credits >= ?`,
      needed,
      entry.userId,
      needed
    );
    if (result === 0) {
      throw new Error(
        `Insufficient credits: user ${entry.userId} needs ${needed} but does not have enough`
      );
    }
  } else {
    // Credit (positive delta) — simple increment
    await tx.wallet.update({
      where: { userId: entry.userId },
      data: { credits: { increment: entry.deltaCredits } },
    });
  }
}

/**
 * Insert multiple ledger entries atomically.
 * Used for double-entry transfers (TRANSFER_OUT + TRANSFER_IN).
 */
export async function insertLedgerEntries(
  tx: TxClient,
  entries: LedgerEntry[]
): Promise<void> {
  for (const entry of entries) {
    await insertLedgerEntry(tx, entry);
  }
}

/**
 * Idempotency soft-check: returns true if a ledger entry with this
 * referenceId + type already exists. Use BEFORE starting a transaction
 * to fast-return on duplicates.
 */
export async function ledgerEntryExists(
  referenceId: string,
  type: LedgerEntryType
): Promise<boolean> {
  const { prisma } = await import("@/lib/db");
  const existing = await prisma.creditLedger.findUnique({
    where: { type_referenceId: { type, referenceId } },
  });
  return !!existing;
}
