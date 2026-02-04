import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { insertLedgerEntry } from "@/lib/credit-ledger";

// PUT: Update order status
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orderId } = await params;
    const body = await request.json();
    const { status } = body;

    const validStatuses = ["accepted", "in_progress", "delivered", "completed", "cancelled", "disputed"];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    const order = await prisma.serviceOrder.findUnique({
      where: { id: orderId },
      include: { service: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const isBuyer = order.buyerId === user.id;
    const isSeller = order.sellerId === user.id;

    if (!isBuyer && !isSeller) {
      return NextResponse.json({ error: "Not authorized to update this order" }, { status: 403 });
    }

    // Validate state transitions by role
    const sellerActions = ["accepted", "in_progress", "delivered"];
    const buyerActions = ["completed", "cancelled", "disputed"];

    if (isSeller && !sellerActions.includes(status)) {
      return NextResponse.json({ error: "Seller can only accept, set in progress, or deliver" }, { status: 403 });
    }

    if (isBuyer && !buyerActions.includes(status)) {
      return NextResponse.json({ error: "Buyer can only complete, cancel, or dispute" }, { status: 403 });
    }

    const newStatus = status.toUpperCase() as
      | "ACCEPTED"
      | "IN_PROGRESS"
      | "DELIVERED"
      | "COMPLETED"
      | "CANCELLED"
      | "DISPUTED";

    // Handle credit transfers on completion/cancellation — all atomic
    const updatedOrder = await prisma.$transaction(async (tx) => {
      if (newStatus === "COMPLETED") {
        // Ensure seller wallet exists
        await tx.wallet.upsert({
          where: { userId: order.sellerId },
          update: {},
          create: { userId: order.sellerId },
        });

        await tx.transaction.create({
          data: {
            userId: order.sellerId,
            type: "SERVICE_PAYOUT",
            amountCents: 0,
            credits: order.credits,
            description: `Payout for service order: ${order.service.title}`,
            status: "COMPLETED",
            metadata: { orderId: order.id },
          },
        });

        // Ledger: credit seller
        await insertLedgerEntry(tx, {
          userId: order.sellerId,
          deltaCredits: order.credits,
          type: "SERVICE_EARNING",
          referenceId: order.id,
          description: `Payout for service: ${order.service.title}`,
        });

        await tx.wallet.update({
          where: { userId: order.sellerId },
          data: { totalEarned: { increment: order.credits } },
        });

        await tx.service.update({
          where: { id: order.serviceId },
          data: { activeOrders: { decrement: 1 } },
        });
      }

      if (newStatus === "CANCELLED") {
        await tx.transaction.create({
          data: {
            userId: order.buyerId,
            type: "SERVICE_PAYMENT",
            amountCents: 0,
            credits: order.credits,
            description: `Refund for cancelled order: ${order.service.title}`,
            status: "REFUNDED",
            metadata: { orderId: order.id },
          },
        });

        // Ledger: refund buyer
        await insertLedgerEntry(tx, {
          userId: order.buyerId,
          deltaCredits: order.credits,
          type: "SERVICE_REFUND",
          referenceId: order.id,
          description: `Refund for cancelled order: ${order.service.title}`,
        });

        await tx.wallet.update({
          where: { userId: order.buyerId },
          data: { totalSpent: { decrement: order.credits } },
        });

        await tx.service.update({
          where: { id: order.serviceId },
          data: { activeOrders: { decrement: 1 } },
        });
      }

      return tx.serviceOrder.update({
        where: { id: orderId },
        data: { status: newStatus },
        include: {
          service: {
            select: { id: true, title: true, category: true, priceCredits: true },
          },
          buyer: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
          seller: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      });
    });

    return NextResponse.json({ order: updatedOrder });
  } catch (error) {
    console.error("PUT /api/services/orders/[orderId] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
