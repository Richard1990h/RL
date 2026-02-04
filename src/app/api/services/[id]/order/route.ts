import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { insertLedgerEntry } from "@/lib/credit-ledger";

// POST: Place an order
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { notes } = body;

    // Get service
    const service = await prisma.service.findUnique({ where: { id } });
    if (!service) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }

    if (!service.isActive) {
      return NextResponse.json({ error: "Service is not active" }, { status: 400 });
    }

    // Check max orders limit
    if (service.maxOrders !== null && service.activeOrders >= service.maxOrders) {
      return NextResponse.json({ error: "Service has reached maximum active orders" }, { status: 400 });
    }

    // Cannot order own service
    if (service.creatorId === user.id) {
      return NextResponse.json({ error: "Cannot order your own service" }, { status: 400 });
    }

    // Validate service price is positive
    if (service.priceCredits <= 0) {
      return NextResponse.json({ error: "Invalid service price" }, { status: 400 });
    }

    // Check buyer wallet
    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet || wallet.credits < service.priceCredits) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
    }

    // Atomic: create order + deduct credits + ledger entry
    const order = await prisma.$transaction(async (tx) => {
      const orderRecord = await tx.serviceOrder.create({
        data: {
          serviceId: id,
          buyerId: user.id,
          sellerId: service.creatorId,
          credits: service.priceCredits,
          notes: notes || null,
          status: "PENDING",
        },
        include: {
          service: true,
          buyer: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
          seller: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      });

      await tx.transaction.create({
        data: {
          userId: user.id,
          type: "SERVICE_PAYMENT",
          amountCents: 0,
          credits: service.priceCredits,
          description: `Order placed for service: ${service.title}`,
          status: "COMPLETED",
          metadata: { orderId: orderRecord.id, serviceId: id },
        },
      });

      // Ledger entry: race-safe debit for escrow
      await insertLedgerEntry(tx, {
        userId: user.id,
        deltaCredits: -service.priceCredits,
        type: "SERVICE_PAYMENT",
        referenceId: orderRecord.id,
        description: `Escrow for service: ${service.title}`,
      });

      await tx.wallet.update({
        where: { userId: user.id },
        data: { totalSpent: { increment: service.priceCredits } },
      });

      await tx.service.update({
        where: { id },
        data: { activeOrders: { increment: 1 } },
      });

      return orderRecord;
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    console.error("POST /api/services/[id]/order error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
