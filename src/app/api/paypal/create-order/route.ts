import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createOrder } from "@/lib/paypal";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_AMOUNT_CENTS = 50_000; // $500 max per order

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireAuth();

    // Rate limit: max 10 order creations per user per 10 minutes
    if (!checkRateLimit(`paypal_create:${currentUser.id}`, 10, 600_000)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait before trying again." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { amountCents, type, packageCredits } = body;

    if (!amountCents || typeof amountCents !== "number" || amountCents < 50 || !Number.isInteger(amountCents)) {
      return NextResponse.json({ error: "Minimum amount is $0.50" }, { status: 400 });
    }

    if (amountCents > MAX_AMOUNT_CENTS) {
      return NextResponse.json({ error: `Maximum amount is $${(MAX_AMOUNT_CENTS / 100).toFixed(2)}` }, { status: 400 });
    }

    if (!type || !["deposit", "credits", "fivem_website"].includes(type)) {
      return NextResponse.json({ error: "Type must be 'deposit', 'credits', or 'fivem_website'" }, { status: 400 });
    }

    // Validate packageCredits against known preset packages
    const VALID_PACKAGES = [
      { credits: 100, priceCents: 99 },
      { credits: 500, priceCents: 499 },
      { credits: 1000, priceCents: 999 },
      { credits: 5000, priceCents: 3999 },
    ];

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
    }

    // Ensure wallet exists for consistency across modules.
    await prisma.wallet.upsert({
      where: { userId: currentUser.id },
      update: {},
      create: { userId: currentUser.id },
    });

    const amountUSD = (amountCents / 100).toFixed(2);
    const description = type === "deposit"
      ? `Rally Live - Add $${amountUSD} to wallet`
      : type === "fivem_website"
        ? `Rally Live - FiveM website monthly plan ($${amountUSD})`
        : `Rally Live - Purchase credits ($${amountUSD})`;

    const order = await createOrder(amountUSD, description);

    return NextResponse.json({
      orderID: order.id,
      status: order.status,
    });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "status" in error && (error as { status?: number }).status === 401) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("PayPal create order error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create PayPal order" },
      { status: 500 }
    );
  }
}
