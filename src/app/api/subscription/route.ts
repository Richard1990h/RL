import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET: Get current subscription status
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: "ACTIVE",
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      isPremium: user.isPremium,
      premiumUntil: user.premiumUntil,
      subscription: subscription || null,
    });
  } catch (error) {
    console.error("GET /api/subscription error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: Subscribe to Premium — requires PayPal payment flow
export async function POST() {
  // Subscriptions must go through the verified PayPal capture flow:
  //   1. POST /api/subscription/paypal/create-order
  //   2. POST /api/subscription/paypal/capture-order
  return NextResponse.json(
    {
      error: "Direct subscription is disabled. Use the PayPal checkout flow.",
      redirectTo: "/api/subscription/paypal/create-order",
    },
    { status: 403 }
  );
}

// DELETE: Cancel subscription
export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const activeSubscription = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: "ACTIVE",
      },
      orderBy: { createdAt: "desc" },
    });

    if (!activeSubscription) {
      return NextResponse.json({ error: "No active subscription found" }, { status: 404 });
    }

    // Cancel the subscription (premium remains until endDate)
    await prisma.subscription.update({
      where: { id: activeSubscription.id },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json({
      success: true,
      message: "Subscription cancelled. Premium access remains until the end of the billing period.",
      premiumUntil: activeSubscription.endDate,
    });
  } catch (error) {
    console.error("DELETE /api/subscription error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
