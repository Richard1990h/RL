import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createOrder } from "@/lib/paypal";

export async function POST() {
  try {
    const currentUser = await requireAuth();

    // Check if already premium
    const user = await prisma.user.findUnique({ where: { id: currentUser.id } });
    if (user?.isPremium) {
      return NextResponse.json({ error: "Already subscribed to Premium" }, { status: 409 });
    }

    // Create PayPal order for $20.00 Premium subscription
    const order = await createOrder("20.00", "Rally Live Premium - $20.00/month");

    return NextResponse.json({
      orderID: order.id,
      status: order.status,
    });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Premium PayPal create order error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create PayPal order" },
      { status: 500 }
    );
  }
}
