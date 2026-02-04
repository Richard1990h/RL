import { NextResponse } from "next/server";

/**
 * POST /api/wallet/credits
 *
 * DISABLED — This endpoint previously auto-completed credit purchases
 * without real payment provider verification (simulated mode).
 *
 * All credit purchases must go through the verified PayPal flow:
 *   1. POST /api/paypal/create-order
 *   2. POST /api/paypal/capture-order
 *
 * This endpoint is intentionally blocked to prevent credit minting
 * without a confirmed payment capture.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Direct credit purchases are disabled. Use the PayPal checkout flow.",
      redirectTo: "/api/paypal/create-order",
    },
    { status: 403 }
  );
}
