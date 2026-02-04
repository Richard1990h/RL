import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { captureOrder } from "@/lib/paypal";
import { insertLedgerEntry, ledgerEntryExists } from "@/lib/credit-ledger";
import { logAudit } from "@/lib/user-storage";
import { checkRateLimit } from "@/lib/rate-limit";

// Hard upper bound: $500 per transaction, 50,000 credits max
const MAX_AMOUNT_CENTS = 50_000;
const MAX_CREDITS_PER_TX = 50_000;

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireAuth();

    // Rate limit: max 5 payment captures per user per 10 minutes
    if (!checkRateLimit(`paypal_capture:${currentUser.id}`, 5, 600_000)) {
      return NextResponse.json(
        { error: "Too many payment requests. Please wait before trying again." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { orderID, amountCents, type, packageCredits } = body;

    if (!orderID || typeof orderID !== "string") {
      return NextResponse.json({ error: "orderID is required" }, { status: 400 });
    }

    if (!amountCents || typeof amountCents !== "number" || amountCents < 50) {
      return NextResponse.json({ error: "amountCents is required" }, { status: 400 });
    }

    // Enforce maximum purchase amount
    if (amountCents > MAX_AMOUNT_CENTS) {
      return NextResponse.json(
        { error: `Maximum purchase amount is $${(MAX_AMOUNT_CENTS / 100).toFixed(2)}` },
        { status: 400 }
      );
    }

    if (!type || !["deposit", "credits"].includes(type)) {
      return NextResponse.json({ error: "Type must be 'deposit' or 'credits'" }, { status: 400 });
    }

    // Validate packageCredits against known preset packages
    const VALID_PACKAGES = [
      { credits: 100, priceCents: 99 },
      { credits: 500, priceCents: 499 },
      { credits: 1000, priceCents: 999 },
      { credits: 5000, priceCents: 3999 },
    ];

    let validatedPackage: { credits: number; priceCents: number } | null = null;
    if (packageCredits !== undefined) {
      const pkg = VALID_PACKAGES.find(
        (p) => p.credits === packageCredits && p.priceCents === amountCents
      );
      if (!pkg) {
        return NextResponse.json(
          { error: "Invalid package: credits/price mismatch" },
          { status: 400 }
        );
      }
      validatedPackage = pkg;
    }

    // Idempotency: if this PayPal order was already minted, return success
    const alreadyProcessed = await ledgerEntryExists(orderID, "PAYPAL_PURCHASE");
    if (alreadyProcessed) {
      const wallet = await prisma.wallet.findUnique({
        where: { userId: currentUser.id },
      });
      return NextResponse.json({
        success: true,
        message: "Payment already processed",
        wallet: { credits: wallet?.credits ?? 0 },
      });
    }

    const wallet = await prisma.wallet.findUnique({
      where: { userId: currentUser.id },
    });

    if (!wallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    // Capture the payment with PayPal
    const captureData = await captureOrder(orderID);

    if (captureData.status !== "COMPLETED") {
      return NextResponse.json(
        { error: "Payment was not completed" },
        { status: 400 }
      );
    }

    const capture = captureData.purchase_units[0]?.payments?.captures?.[0];
    if (!capture) {
      return NextResponse.json(
        { error: "No capture found in PayPal response" },
        { status: 400 }
      );
    }

    const capturedAmountCents = Math.round(parseFloat(capture.amount.value) * 100);

    // Validate currency is USD
    if (capture.amount.currency_code !== "USD") {
      return NextResponse.json(
        { error: `Expected USD payment, got ${capture.amount.currency_code}` },
        { status: 400 }
      );
    }

    // Load configurable platform fee
    const feeConfig = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });
    const purchaseFeePct = feeConfig?.purchaseFeePct ?? 5;

    let credits: number;
    let processingFeeCents: number;
    let platformFeeCents: number;
    let totalFeeCents: number;
    let netAmountCents: number;

    if (validatedPackage) {
      // Preset package: validate captured amount matches package price, mint exact credits
      if (capturedAmountCents !== validatedPackage.priceCents) {
        return NextResponse.json(
          { error: `Payment amount mismatch: expected ${validatedPackage.priceCents}, got ${capturedAmountCents}` },
          { status: 400 }
        );
      }
      credits = validatedPackage.credits;
      processingFeeCents = 0;
      platformFeeCents = 0;
      totalFeeCents = 0;
      netAmountCents = capturedAmountCents;
    } else {
      // Custom amount: calculate fees and derive credits
      processingFeeCents = Math.ceil(capturedAmountCents * 0.0349 + 49);
      platformFeeCents = Math.ceil(capturedAmountCents * (purchaseFeePct / 100));
      totalFeeCents = processingFeeCents + platformFeeCents;
      netAmountCents = capturedAmountCents - totalFeeCents;

      if (netAmountCents <= 0) {
        return NextResponse.json({ error: "Amount too small after fees" }, { status: 400 });
      }

      credits = Math.floor(netAmountCents);
    }

    // Hard cap on credits minted per transaction
    if (credits > MAX_CREDITS_PER_TX) {
      return NextResponse.json(
        { error: `Maximum credits per transaction is ${MAX_CREDITS_PER_TX.toLocaleString()}` },
        { status: 400 }
      );
    }

    const transaction = await prisma.$transaction(async (tx) => {
      const txRecord = await tx.transaction.create({
        data: {
          userId: currentUser.id,
          type: "CREDIT_PURCHASE",
          amountCents: capturedAmountCents,
          credits,
          description: `Purchased ${credits} credits for $${(capturedAmountCents / 100).toFixed(2)} via PayPal`,
          status: "COMPLETED",
          paypalId: capture.id,
          metadata: {
            paypalOrderId: orderID,
            paypalCaptureId: capture.id,
            grossAmount: capturedAmountCents,
            processingFee: processingFeeCents,
            platformFee: platformFeeCents,
            totalFee: totalFeeCents,
            netAmount: netAmountCents,
            creditsReceived: credits,
            method: "paypal",
            originalType: type,
            ...(validatedPackage ? { packageCredits: validatedPackage.credits, packagePriceCents: validatedPackage.priceCents } : {}),
          },
        },
      });

      // Ledger entry with orderID as referenceId for idempotency
      // @@unique([type, referenceId]) prevents double-mint at DB level
      await insertLedgerEntry(tx, {
        userId: currentUser.id,
        deltaCredits: credits,
        type: "PAYPAL_PURCHASE",
        referenceId: orderID,
        description: `Purchased ${credits} credits for $${(capturedAmountCents / 100).toFixed(2)} via PayPal`,
      });

      // Update totalSpent separately
      await tx.wallet.update({
        where: { userId: currentUser.id },
        data: { totalSpent: { increment: capturedAmountCents } },
      });

      return txRecord;
    });

    const updatedWallet = await prisma.wallet.findUnique({
      where: { userId: currentUser.id },
    });

    try {
      await logAudit(currentUser.email, "credits", {
        amount: credits,
        method: "paypal",
        pricePaidCents: capturedAmountCents,
        orderId: orderID,
      });
    } catch {} // Non-fatal

    return NextResponse.json({
      success: true,
      transaction: {
        id: transaction.id,
        credits: transaction.credits,
        status: transaction.status,
      },
      wallet: {
        credits: updatedWallet!.credits,
      },
    });
  } catch (error: any) {
    if (error?.status === 401) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("PayPal capture error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to capture PayPal payment" },
      { status: 500 }
    );
  }
}
