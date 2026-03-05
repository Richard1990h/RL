import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureFivemTables, normalizeFivemSlug, generateApiKey } from "@/lib/fivem/server-db";
import { insertLedgerEntries } from "@/lib/credit-ledger";
import { enforceDueFivemRenewals } from "@/lib/fivem/billing";

const FIVEM_WEBSITE_CREATE_CREDITS = Number(process.env.FIVEM_WEBSITE_CREATE_CREDITS ?? 200);

type ServerRow = {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  websiteName: string;
  summary: string | null;
  discordMemberCount: number;
  onlinePlayers: number;
  maxPlayers: number;
  whitelistOpen: boolean;
  createdAt: Date;
};

export async function GET(request: NextRequest) {
  try {
    await ensureFivemTables();
    await enforceDueFivemRenewals(50);
    const user = await getCurrentUser();
    const mineOnly = new URL(request.url).searchParams.get("mine") === "1";

    const servers = mineOnly && user
      ? await prisma.$queryRaw<ServerRow[]>`
          SELECT s.id, s.ownerId, s.slug, s.name, s.websiteName, s.summary,
                 s.discordMemberCount, s.onlinePlayers, s.maxPlayers, s.whitelistOpen, s.createdAt
          FROM FivemServer s
          INNER JOIN FivemServerMember m ON m.serverId = s.id
          WHERE m.userId = ${user.id} AND m.status = 'ACTIVE'
          ORDER BY s.createdAt DESC
          LIMIT 100
        `
      : await prisma.$queryRaw<ServerRow[]>`
          SELECT id, ownerId, slug, name, websiteName, summary, discordMemberCount,
                 onlinePlayers, maxPlayers, whitelistOpen, createdAt
          FROM FivemServer
          WHERE isPublished = true
          ORDER BY createdAt DESC
          LIMIT 120
        `;

    return NextResponse.json({
      servers,
      websiteCreateCostCredits: FIVEM_WEBSITE_CREATE_CREDITS,
    });
  } catch (error) {
    console.error("GET /api/fivem/servers error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureFivemTables();
    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    const name = String(body?.name || "").trim();
    const websiteName = String(body?.websiteName || name).trim();
    const summary = String(body?.summary || "").trim();
    const requestedSlug = String(body?.slug || name).trim();
    const slug = normalizeFivemSlug(requestedSlug);

    if (!name || !slug) {
      return NextResponse.json({ error: "name and slug are required" }, { status: 400 });
    }

    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM FivemServer WHERE slug = ${slug} LIMIT 1
    `;
    if (existing.length > 0) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }

    const serverIdRows = await prisma.$queryRaw<{ id: string }[]>`SELECT UUID() AS id`;
    const memberIdRows = await prisma.$queryRaw<{ id: string }[]>`SELECT UUID() AS id`;
    const subscriptionIdRows = await prisma.$queryRaw<{ id: string }[]>`SELECT UUID() AS id`;
    const serverId = serverIdRows[0]?.id;
    const memberId = memberIdRows[0]?.id;
    const subscriptionId = subscriptionIdRows[0]?.id;
    if (!serverId || !memberId || !subscriptionId) {
      return NextResponse.json({ error: "Unable to create server ids" }, { status: 500 });
    }
    const apiKey = generateApiKey();

    await prisma.$transaction(async (tx) => {
      await tx.wallet.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id },
      });

      const spendTx = await tx.transaction.create({
        data: {
          userId: user.id,
          type: "CREDIT_SPENT",
          amountCents: FIVEM_WEBSITE_CREATE_CREDITS,
          credits: -FIVEM_WEBSITE_CREATE_CREDITS,
          description: `FiveM website setup fee (${name.slice(0, 120)})`,
          status: "COMPLETED",
        },
      });

      await insertLedgerEntries(tx, [
        {
          userId: user.id,
          deltaCredits: -FIVEM_WEBSITE_CREATE_CREDITS,
          type: "SERVICE_PAYMENT",
          referenceId: spendTx.id,
          description: `Created FiveM website ${name.slice(0, 120)} (${FIVEM_WEBSITE_CREATE_CREDITS} credits)`,
        },
      ]);

      await tx.$executeRaw`
        INSERT INTO FivemServer
        (id, ownerId, slug, name, websiteName, summary, description, isPublished, whitelistOpen, apiKey, createdAt, updatedAt)
        VALUES
        (${serverId}, ${user.id}, ${slug}, ${name.slice(0, 120)}, ${websiteName.slice(0, 120)}, ${summary.slice(0, 300)}, ${summary.slice(0, 300)}, ${true}, ${false}, ${apiKey}, ${new Date()}, ${new Date()})
      `;

      await tx.$executeRaw`
        INSERT INTO FivemServerMember
        (id, serverId, userId, role, status, createdAt, updatedAt)
        VALUES
        (${memberId}, ${serverId}, ${user.id}, ${"ADMIN"}, ${"ACTIVE"}, ${new Date()}, ${new Date()})
      `;

      await tx.$executeRaw`
        INSERT INTO FivemWebsiteSubscription
        (id, userId, serverId, status, amountCents, billingPeriod, startedAt, nextBillingAt, createdAt, updatedAt)
        VALUES
        (${subscriptionId}, ${user.id}, ${serverId}, ${"ACTIVE"}, ${FIVEM_WEBSITE_CREATE_CREDITS}, ${"MONTHLY"}, ${new Date()}, ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)}, ${new Date()}, ${new Date()})
      `;
    });

    return NextResponse.json(
      {
        ok: true,
        server: { id: serverId, slug, name, websiteName, apiKey },
        chargedCredits: FIVEM_WEBSITE_CREATE_CREDITS,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message.includes("Insufficient credits")) {
      return NextResponse.json(
        {
          error: `Insufficient credits. Creating a FiveM website costs ${FIVEM_WEBSITE_CREATE_CREDITS} credits.`,
          requiredCredits: FIVEM_WEBSITE_CREATE_CREDITS,
          nextStep: "Buy credits in Wallet first.",
        },
        { status: 402 },
      );
    }
    console.error("POST /api/fivem/servers error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
