import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();
const MAX_EXAMPLES = 50;

async function main() {
  console.log("=== CreditLedger Reconciliation Report ===\n");

  let allPassed = true;

  // ─── Check 1: Transfer integrity ───
  console.log("Check 1: Transfer referenceId integrity (TRANSFER_OUT + TRANSFER_IN sum to 0)");
  {
    const transferEntries = await prisma.creditLedger.findMany({
      where: { type: { in: ["TRANSFER_OUT", "TRANSFER_IN"] } },
      select: { referenceId: true, deltaCredits: true, type: true },
    });

    const byRef = new Map<string, { count: number; sum: number; types: string[] }>();
    for (const e of transferEntries) {
      const existing = byRef.get(e.referenceId) ?? { count: 0, sum: 0, types: [] };
      existing.count++;
      existing.sum += e.deltaCredits;
      existing.types.push(e.type);
      byRef.set(e.referenceId, existing);
    }

    const failures: string[] = [];
    for (const [refId, data] of byRef) {
      if (data.count !== 2 || data.sum !== 0) {
        failures.push(`  referenceId=${refId} count=${data.count} sum=${data.sum} types=[${data.types.join(",")}]`);
      }
    }

    if (failures.length === 0) {
      console.log(`  PASS: ${byRef.size} transfer pairs verified.\n`);
    } else {
      allPassed = false;
      console.log(`  FAIL: ${failures.length} issues found:`);
      failures.slice(0, MAX_EXAMPLES).forEach((f) => console.log(f));
      if (failures.length > MAX_EXAMPLES) console.log(`  ... and ${failures.length - MAX_EXAMPLES} more`);
      console.log();
    }
  }

  // ─── Check 2: No duplicate PAYPAL_PURCHASE referenceIds ───
  console.log("Check 2: No duplicate PAYPAL_PURCHASE referenceIds");
  {
    const paypalEntries = await prisma.creditLedger.findMany({
      where: { type: "PAYPAL_PURCHASE" },
      select: { referenceId: true },
    });

    const seen = new Map<string, number>();
    for (const e of paypalEntries) {
      seen.set(e.referenceId, (seen.get(e.referenceId) ?? 0) + 1);
    }

    const duplicates = [...seen.entries()].filter(([, count]) => count > 1);
    if (duplicates.length === 0) {
      console.log(`  PASS: ${paypalEntries.length} PAYPAL_PURCHASE entries, all unique.\n`);
    } else {
      allPassed = false;
      console.log(`  FAIL: ${duplicates.length} duplicate referenceIds:`);
      duplicates.slice(0, MAX_EXAMPLES).forEach(([refId, count]) =>
        console.log(`  referenceId=${refId} count=${count}`)
      );
      console.log();
    }
  }

  // ─── Check 3: No user has negative SUM(deltaCredits) ───
  console.log("Check 3: No user has negative SUM(deltaCredits)");
  {
    const userSums = await prisma.creditLedger.groupBy({
      by: ["userId"],
      _sum: { deltaCredits: true },
    });

    const negatives = userSums.filter((u) => (u._sum.deltaCredits ?? 0) < 0);
    if (negatives.length === 0) {
      console.log(`  PASS: ${userSums.length} users checked, all non-negative.\n`);
    } else {
      allPassed = false;
      console.log(`  FAIL: ${negatives.length} users with negative ledger sum:`);
      negatives.slice(0, MAX_EXAMPLES).forEach((u) =>
        console.log(`  userId=${u.userId} sum=${u._sum.deltaCredits}`)
      );
      console.log();
    }
  }

  // ─── Check 4: wallet.credits matches SUM(deltaCredits) per user ───
  console.log("Check 4: wallet.credits matches SUM(deltaCredits) per user");
  {
    const wallets = await prisma.wallet.findMany({
      select: { userId: true, credits: true },
    });

    const ledgerSums = await prisma.creditLedger.groupBy({
      by: ["userId"],
      _sum: { deltaCredits: true },
    });

    const sumMap = new Map(ledgerSums.map((l) => [l.userId, l._sum.deltaCredits ?? 0]));

    const mismatches: string[] = [];
    for (const w of wallets) {
      const ledgerSum = sumMap.get(w.userId) ?? 0;
      if (w.credits !== ledgerSum) {
        mismatches.push(`  userId=${w.userId} wallet.credits=${w.credits} ledgerSum=${ledgerSum} diff=${w.credits - ledgerSum}`);
      }
    }

    if (mismatches.length === 0) {
      console.log(`  PASS: ${wallets.length} wallets match their ledger sums.\n`);
    } else {
      allPassed = false;
      console.log(`  FAIL: ${mismatches.length} mismatches:`);
      mismatches.slice(0, MAX_EXAMPLES).forEach((m) => console.log(m));
      if (mismatches.length > MAX_EXAMPLES) console.log(`  ... and ${mismatches.length - MAX_EXAMPLES} more`);
      console.log();
    }
  }

  // ─── Check 5: System-wide totals ───
  console.log("Check 5: System-wide SUM(wallet.credits) == SUM(deltaCredits)");
  {
    const walletTotal = await prisma.wallet.aggregate({ _sum: { credits: true } });
    const ledgerTotal = await prisma.creditLedger.aggregate({ _sum: { deltaCredits: true } });

    const wSum = walletTotal._sum.credits ?? 0;
    const lSum = ledgerTotal._sum.deltaCredits ?? 0;

    if (wSum === lSum) {
      console.log(`  PASS: system total = ${wSum} credits.\n`);
    } else {
      allPassed = false;
      console.log(`  FAIL: wallet sum=${wSum}, ledger sum=${lSum}, diff=${wSum - lSum}\n`);
    }
  }

  // ─── Final ───
  console.log("═══════════════════════════════");
  if (allPassed) {
    console.log("ALL CHECKS PASSED");
  } else {
    console.log("SOME CHECKS FAILED — review above");
  }
  console.log("═══════════════════════════════");
}

main()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
