import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureFivemTables, normalizeFivemSlug, generateApiKey } from "@/lib/fivem/server-db";
import { enforceFivemServerBilling } from "@/lib/fivem/billing";

type ServerRow = {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  websiteName: string;
  summary: string | null;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  discordInviteUrl: string | null;
  discordMemberCount: number;
  onlinePlayers: number;
  maxPlayers: number;
  whitelistOpen: boolean;
  isPublished: boolean;
  lastHeartbeatAt: Date | null;
};

type JobRow = {
  id: string;
  title: string;
  description: string | null;
  whitelistOnly: boolean;
  isActive: boolean;
  sortOrder: number;
};

type VipPackageRow = {
  id: string;
  name: string;
  description: string | null;
  priceCredits: number;
  durationDays: number;
  isActive: boolean;
  sortOrder: number;
};

type WebsiteSubscriptionRow = {
  id: string;
  status: string;
  amountCents: number;
  nextBillingAt: Date;
};

async function getViewerRole(serverId: string, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const ownerRows = await prisma.$queryRaw<{ ownerId: string }[]>`
    SELECT ownerId FROM FivemServer WHERE id = ${serverId} LIMIT 1
  `;
  if (ownerRows[0]?.ownerId === userId) return "ADMIN";
  const rows = await prisma.$queryRaw<{ role: string }[]>`
    SELECT role
    FROM FivemServerMember
    WHERE serverId = ${serverId} AND userId = ${userId} AND status = 'ACTIVE'
    LIMIT 1
  `;
  return rows[0]?.role ?? null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureFivemTables();
    const { slug: rawSlug } = await params;
    const slug = normalizeFivemSlug(rawSlug);
    const user = await getCurrentUser();

    const servers = await prisma.$queryRaw<ServerRow[]>`
      SELECT id, ownerId, slug, name, websiteName, summary, description, logoUrl, coverUrl, discordInviteUrl,
             discordMemberCount, onlinePlayers, maxPlayers, whitelistOpen, isPublished, lastHeartbeatAt
      FROM FivemServer
      WHERE slug = ${slug}
      LIMIT 1
    `;
    const server = servers[0];
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const billing = await enforceFivemServerBilling(server.id);
    if (!billing.active) {
      return NextResponse.json({ error: "Server hidden: billing requires credits renewal." }, { status: 404 });
    }

    const refreshed = await prisma.$queryRaw<ServerRow[]>`
      SELECT id, ownerId, slug, name, websiteName, summary, description, logoUrl, coverUrl, discordInviteUrl,
             discordMemberCount, onlinePlayers, maxPlayers, whitelistOpen, isPublished, lastHeartbeatAt
      FROM FivemServer
      WHERE id = ${server.id}
      LIMIT 1
    `;
    const currentServer = refreshed[0] ?? server;

    const viewerRole = await getViewerRole(currentServer.id, user?.id ?? null);
    if (!currentServer.isPublished && !viewerRole) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const jobs = await prisma.$queryRaw<JobRow[]>`
      SELECT id, title, description, whitelistOnly, isActive, sortOrder
      FROM FivemServerJob
      WHERE serverId = ${currentServer.id}
      ORDER BY sortOrder ASC, createdAt ASC
      LIMIT 100
    `;

    const vipPackages = await prisma.$queryRaw<VipPackageRow[]>`
      SELECT id, name, description, priceCredits, durationDays, isActive, sortOrder
      FROM FivemServerVipPackage
      WHERE serverId = ${currentServer.id} AND isActive = true
      ORDER BY sortOrder ASC, createdAt ASC
      LIMIT 20
    `;

    const websiteSubscriptionRows = await prisma.$queryRaw<WebsiteSubscriptionRow[]>`
      SELECT id, status, amountCents, nextBillingAt
      FROM FivemWebsiteSubscription
      WHERE serverId = ${currentServer.id}
      LIMIT 1
    `;
    const websiteSubscription = websiteSubscriptionRows[0] ?? null;

    // Include apiKey for admin viewers; generate one if missing
    let apiKey: string | null = null;
    if (viewerRole === "ADMIN") {
      const keyRows = await prisma.$queryRaw<{ apiKey: string | null }[]>`
        SELECT apiKey FROM FivemServer WHERE id = ${currentServer.id} LIMIT 1
      `;
      apiKey = keyRows[0]?.apiKey ?? null;
      if (!apiKey) {
        apiKey = generateApiKey();
        await prisma.$executeRaw`
          UPDATE FivemServer SET apiKey = ${apiKey} WHERE id = ${currentServer.id}
        `;
      }
    }

    return NextResponse.json({ server: { ...currentServer, ...(apiKey ? { apiKey } : {}) }, jobs, vipPackages, websiteSubscription, viewerRole, viewerUserId: user?.id ?? null });
  } catch (error) {
    console.error("GET /api/fivem/servers/[slug] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureFivemTables();
    const { slug: rawSlug } = await params;
    const slug = normalizeFivemSlug(rawSlug);
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT s.id
      FROM FivemServer s
      INNER JOIN FivemServerMember m ON m.serverId = s.id
      WHERE s.slug = ${slug} AND m.userId = ${user.id} AND m.role = 'ADMIN' AND m.status = 'ACTIVE'
      LIMIT 1
    `;
    const serverId = rows[0]?.id;
    if (!serverId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    const websiteName = String(body?.websiteName ?? "").trim();
    const summary = String(body?.summary ?? "").trim();
    const description = String(body?.description ?? "").trim();
    const logoUrl = String(body?.logoUrl ?? "").trim();
    const coverUrl = String(body?.coverUrl ?? "").trim();
    const discordInviteUrl = String(body?.discordInviteUrl ?? "").trim();
    const onlinePlayers = Number(body?.onlinePlayers ?? 0);
    const maxPlayers = Number(body?.maxPlayers ?? 64);
    const discordMemberCount = Number(body?.discordMemberCount ?? 0);
    const whitelistOpen = Boolean(body?.whitelistOpen);
    const isPublished = Boolean(body?.isPublished ?? true);

    await prisma.$executeRaw`
      UPDATE FivemServer
      SET websiteName = ${websiteName.slice(0, 120)},
          summary = ${summary.slice(0, 300)},
          description = ${description.slice(0, 5000)},
          logoUrl = ${logoUrl || null},
          coverUrl = ${coverUrl || null},
          discordInviteUrl = ${discordInviteUrl || null},
          onlinePlayers = ${Math.max(0, Math.trunc(onlinePlayers))},
          maxPlayers = ${Math.max(1, Math.trunc(maxPlayers))},
          discordMemberCount = ${Math.max(0, Math.trunc(discordMemberCount))},
          whitelistOpen = ${whitelistOpen},
          isPublished = ${isPublished},
          updatedAt = ${new Date()}
      WHERE id = ${serverId}
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/fivem/servers/[slug] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
