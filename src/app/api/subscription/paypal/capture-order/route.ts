import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { captureOrder } from "@/lib/paypal";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireAuth();

    // Rate limit: max 3 subscription captures per user per 10 minutes
    if (!checkRateLimit(`sub_capture:${currentUser.id}`, 3, 600_000)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait before trying again." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { orderID } = body;

    if (!orderID || typeof orderID !== "string") {
      return NextResponse.json({ error: "orderID is required" }, { status: 400 });
    }

    // Check if already premium
    const user = await prisma.user.findUnique({ where: { id: currentUser.id } });
    if (user?.isPremium) {
      return NextResponse.json({ error: "Already subscribed to Premium" }, { status: 409 });
    }

    // Capture the PayPal payment
    const captureData = await captureOrder(orderID);

    if (captureData.status !== "COMPLETED") {
      return NextResponse.json({ error: "Payment was not completed" }, { status: 400 });
    }

    const capture = captureData.purchase_units[0]?.payments?.captures?.[0];
    if (!capture) {
      return NextResponse.json({ error: "No capture found in PayPal response" }, { status: 400 });
    }

    // Idempotency: check if this PayPal capture was already processed
    const existingTx = await prisma.transaction.findFirst({
      where: { paypalId: capture.id, type: "SUBSCRIPTION" },
    });
    if (existingTx) {
      return NextResponse.json({
        success: true,
        message: "Payment already processed",
        isPremium: true,
      });
    }

    // Payment successful — activate Premium
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);

    const result = await prisma.$transaction(async (tx) => {
      // Create subscription record
      const subscription = await tx.subscription.create({
        data: {
          userId: currentUser.id,
          plan: "PREMIUM",
          status: "ACTIVE",
          startDate,
          endDate,
        },
      });

      // Update user premium status
      await tx.user.update({
        where: { id: currentUser.id },
        data: {
          isPremium: true,
          premiumUntil: endDate,
        },
      });

      // Create transaction record with real PayPal IDs
      await tx.transaction.create({
        data: {
          userId: currentUser.id,
          type: "SUBSCRIPTION",
          amountCents: 2000,
          credits: 0,
          description: "Premium subscription via PayPal - $20.00/month",
          status: "COMPLETED",
          paypalId: capture.id,
          metadata: {
            paypalOrderId: orderID,
            paypalCaptureId: capture.id,
            capturedAmount: capture.amount.value,
            currency: capture.amount.currency_code,
            method: "paypal",
          },
        },
      });

      return subscription;
    });

    return NextResponse.json({
      success: true,
      isPremium: true,
      premiumUntil: endDate,
      subscription: {
        id: result.id,
        plan: result.plan,
        status: result.status,
        startDate: result.startDate,
        endDate: result.endDate,
      },
    });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Premium PayPal capture error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to capture PayPal payment" },
      { status: 500 }
    );
  }
}
