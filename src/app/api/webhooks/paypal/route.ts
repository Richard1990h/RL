import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { insertLedgerEntry, ledgerEntryExists } from "@/lib/credit-ledger";
import { getTreasuryUserId } from "@/lib/treasury";

const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID ?? "";
const PAYPAL_API_BASE = process.env.PAYPAL_API_BASE ?? "https://api-m.paypal.com";
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID ?? "";
const PAYPAL_SECRET = process.env.PAYPAL_CLIENT_SECRET ?? process.env.PAYPAL_SECRET ?? "";

async function getPayPalAccessToken(): Promise<string> {
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  return data.access_token;
}

async function verifyWebhookSignature(
  headers: Headers,
  rawBody: string
): Promise<boolean> {
  if (!PAYPAL_WEBHOOK_ID) {
    console.warn("PAYPAL_WEBHOOK_ID not set — skipping verification");
    return false;
  }

  const accessToken = await getPayPalAccessToken();

  const verifyPayload = {
    auth_algo: headers.get("paypal-auth-algo") ?? "",
    cert_url: headers.get("paypal-cert-url") ?? "",
    transmission_id: headers.get("paypal-transmission-id") ?? "",
    transmission_sig: headers.get("paypal-transmission-sig") ?? "",
    transmission_time: headers.get("paypal-transmission-time") ?? "",
    webhook_id: PAYPAL_WEBHOOK_ID,
    webhook_event: JSON.parse(rawBody),
  };

  const res = await fetch(
    `${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(verifyPayload),
    }
  );

  const result = await res.json();
  return result.verification_status === "SUCCESS";
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();

    // Verify signature
    const isValid = await verifyWebhookSignature(req.headers, rawBody);
    if (!isValid) {
      console.error("PayPal webhook signature verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const eventType = event.event_type as string;
    const resource = event.resource ?? {};

    if (eventType === "PAYMENT.PAYOUTS-ITEM.SUCCEEDED") {
      const referenceId = resource.payout_item?.sender_item_id;
      if (!referenceId) {
        return NextResponse.json({ status: "ignored" }, { status: 200 });
      }

      // Idempotency check
      const alreadySettled = await ledgerEntryExists(referenceId, "PLATFORM_FEE_SETTLED");
      if (alreadySettled) {
        return NextResponse.json({ status: "duplicate" }, { status: 200 });
      }

      const treasuryUserId = await getTreasuryUserId();

      await prisma.$transaction(async (tx) => {
        // Marker entry — no balance change, just records settlement
        await tx.creditLedger.create({
          data: {
            userId: treasuryUserId,
            deltaCredits: 0,
            type: "PLATFORM_FEE_SETTLED",
            referenceId,
            description: `Payout settled for transaction ${referenceId}`,
          },
        });

        await tx.transaction.updateMany({
          where: { id: referenceId },
          data: { status: "COMPLETED" },
        });
      });

      return NextResponse.json({ status: "settled" }, { status: 200 });
    }

    if (
      eventType === "PAYMENT.PAYOUTS-ITEM.FAILED" ||
      eventType === "PAYMENT.PAYOUTS-ITEM.RETURNED"
    ) {
      const referenceId = resource.payout_item?.sender_item_id;
      if (!referenceId) {
        return NextResponse.json({ status: "ignored" }, { status: 200 });
      }

      // Idempotency check
      const alreadyReversed = await ledgerEntryExists(`reversal_${referenceId}`, "REVERSAL");
      if (alreadyReversed) {
        return NextResponse.json({ status: "duplicate" }, { status: 200 });
      }

      // Look up the original transaction to get amounts
      const originalTx = await prisma.transaction.findUnique({
        where: { id: referenceId },
        select: { userId: true, credits: true, metadata: true },
      });

      if (!originalTx) {
        console.error(`PayPal webhook: transaction ${referenceId} not found`);
        return NextResponse.json({ status: "not_found" }, { status: 200 });
      }

      const creditsToRefund = Math.abs(originalTx.credits);
      const feeCredits = (originalTx.metadata as any)?.feeCredits ?? (originalTx.metadata as any)?.fee ?? 0;
      const treasuryUserId = await getTreasuryUserId();

      const newStatus = eventType === "PAYMENT.PAYOUTS-ITEM.FAILED" ? "FAILED" : "REFUNDED";

      await prisma.$transaction(async (tx) => {
        // Refund user
        await insertLedgerEntry(tx, {
          userId: originalTx.userId,
          deltaCredits: creditsToRefund,
          type: "REVERSAL",
          referenceId: `reversal_${referenceId}`,
          description: `Payout ${newStatus.toLowerCase()} — credits refunded`,
        });

        // Claw back fee from admin
        if (feeCredits > 0) {
          await insertLedgerEntry(tx, {
            userId: treasuryUserId,
            deltaCredits: -feeCredits,
            type: "REVERSAL",
            referenceId: `reversal_fee_${referenceId}`,
            description: `Payout ${newStatus.toLowerCase()} — fee clawed back`,
          });
        }

        await tx.transaction.updateMany({
          where: { id: referenceId },
          data: { status: newStatus as any },
        });
      });

      return NextResponse.json({ status: "reversed" }, { status: 200 });
    }

    // Unhandled event type
    return NextResponse.json({ status: "ignored" }, { status: 200 });
  } catch (error) {
    console.error("PayPal webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
