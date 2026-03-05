import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { captureOrder } from "@/lib/paypal";
import { ensureFivemTables, normalizeFivemSlug } from "@/lib/fivem/server-db";
import { checkRateLimit } from "@/lib/rate-limit";

const FIVEM_WEBSITE_MONTHLY_CENTS = Number(process.env.FIVEM_WEBSITE_MONTHLY_CENTS ?? 200);

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    await ensureFivemTables();

    if (!checkRateLimit(`fivem_subscribe_create:${user.id}`, 5, 600_000)) {
      return NextResponse.json({ error: "Too many requests. Please wait and try again." }, { status: 429 });
    }

    let body;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    const orderID = String(body?.orderID || "").trim();
    const name = String(body?.name || "").trim();
    const websiteName = String(body?.websiteName || name).trim();
    const summary = String(body?.summary || "").trim();
    const requestedSlug = String(body?.slug || name).trim();
    const slug = normalizeFivemSlug(requestedSlug);

    if (!orderID || !name || !slug) {
      return NextResponse.json({ error: "orderID, name, and slug are required" }, { status: 400 });
    }

    const existingSlug = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM FivemServer WHERE slug = ${slug} LIMIT 1
    `;
    if (existingSlug.length > 0) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }

    const captureData = await captureOrder(orderID);
    if (captureData.status !== "COMPLETED") {
      return NextResponse.json({ error: "Payment was not completed" }, { status: 400 });
    }
    const capture = captureData.purchase_units[0]?.payments?.captures?.[0];
    if (!capture || capture.amount.currency_code !== "USD") {
      return NextResponse.json({ error: "Invalid PayPal capture response" }, { status: 400 });
    }

    const capturedAmountCents = Math.round(parseFloat(capture.amount.value) * 100);
    if (capturedAmountCents !== FIVEM_WEBSITE_MONTHLY_CENTS) {
      return NextResponse.json(
        { error: `Incorrect amount. Expected $${(FIVEM_WEBSITE_MONTHLY_CENTS / 100).toFixed(2)}.` },
        { status: 400 },
      );
    }

    const alreadyProcessed = await prisma.transaction.findFirst({
      where: { paypalId: capture.id, type: "SUBSCRIPTION" },
      select: { id: true },
    });
    if (alreadyProcessed) {
      return NextResponse.json({ error: "Payment already processed" }, { status: 409 });
    }

    const idRows = await prisma.$queryRaw<{ id: string }[]>`SELECT UUID() AS id`;
    const memberRows = await prisma.$queryRaw<{ id: string }[]>`SELECT UUID() AS id`;
    const subRows = await prisma.$queryRaw<{ id: string }[]>`SELECT UUID() AS id`;
    const serverId = idRows[0]?.id;
    const memberId = memberRows[0]?.id;
    const subscriptionId = subRows[0]?.id;
    if (!serverId || !memberId || !subscriptionId) {
      return NextResponse.json({ error: "Could not allocate ids" }, { status: 500 });
    }

    const now = new Date();
    const nextBillingAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO FivemServer
        (id, ownerId, slug, name, websiteName, summary, description, isPublished, whitelistOpen, createdAt, updatedAt)
        VALUES
        (${serverId}, ${user.id}, ${slug}, ${name.slice(0, 120)}, ${websiteName.slice(0, 120)}, ${summary.slice(0, 300)}, ${summary.slice(0, 300)}, ${true}, ${false}, ${now}, ${now})
      `;

      await tx.$executeRaw`
        INSERT INTO FivemServerMember
        (id, serverId, userId, role, status, createdAt, updatedAt)
        VALUES
        (${memberId}, ${serverId}, ${user.id}, ${"ADMIN"}, ${"ACTIVE"}, ${now}, ${now})
      `;

      await tx.$executeRaw`
        INSERT INTO FivemWebsiteSubscription
        (id, userId, serverId, status, amountCents, billingPeriod, paypalOrderId, paypalCaptureId, startedAt, nextBillingAt, createdAt, updatedAt)
        VALUES
        (${subscriptionId}, ${user.id}, ${serverId}, ${"ACTIVE"}, ${FIVEM_WEBSITE_MONTHLY_CENTS}, ${"MONTHLY"}, ${orderID}, ${capture.id}, ${now}, ${nextBillingAt}, ${now}, ${now})
      `;

      await tx.transaction.create({
        data: {
          userId: user.id,
          type: "SUBSCRIPTION",
          amountCents: FIVEM_WEBSITE_MONTHLY_CENTS,
          credits: 0,
          description: `FiveM website monthly subscription: ${name.slice(0, 120)}`,
          status: "COMPLETED",
          paypalId: capture.id,
          metadata: {
            module: "fivem",
            plan: "website_monthly",
            serverId,
            paypalOrderId: orderID,
            paypalCaptureId: capture.id,
            nextBillingAt: nextBillingAt.toISOString(),
          },
        },
      });
    });

    return NextResponse.json({
      ok: true,
      server: { id: serverId, slug, name, websiteName },
      subscription: {
        id: subscriptionId,
        amountCents: FIVEM_WEBSITE_MONTHLY_CENTS,
        status: "ACTIVE",
        nextBillingAt: nextBillingAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "status" in error && (error as { status?: number }).status === 401) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("POST /api/fivem/servers/subscribe-create error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
