import { PrismaClient } from "../../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  console.log("=== CreditLedger Backfill ===\n");

  const wallets = await prisma.wallet.findMany({
    where: { credits: { gt: 0 } },
    select: { userId: true, credits: true },
  });

  console.log(`Wallets scanned with credits > 0: ${wallets.length}`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const wallet of wallets) {
    const referenceId = `backfill_${wallet.userId}`;

    try {
      // Check if already backfilled (idempotent)
      const existing = await prisma.creditLedger.findUnique({
        where: { type_referenceId: { type: "ADJUSTMENT", referenceId } },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await prisma.creditLedger.create({
        data: {
          userId: wallet.userId,
          deltaCredits: wallet.credits,
          type: "ADJUSTMENT",
          referenceId,
          description: "initial ledger seed from wallet.credits",
        },
      });

      inserted++;
    } catch (err) {
      errors++;
      console.error(`ERROR for userId=${wallet.userId}:`, err);
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Scanned:  ${wallets.length}`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Errors:   ${errors}`);
  console.log(`\nBackfill complete.`);
}

main()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
