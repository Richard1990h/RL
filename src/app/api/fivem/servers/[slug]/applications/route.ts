import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureFivemTables, normalizeFivemSlug } from "@/lib/fivem/server-db";
import { payWithPlatformCut } from "@/lib/fivem/fees";

type ServerAccessRow = {
  serverId: string;
  ownerId: string;
  role: string | null;
};

type ApplicationRow = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  type: string;
  targetName: string;
  message: string | null;
  status: string;
  paidCredits: number;
  reviewedNote: string | null;
  createdAt: Date;
};

async function getServerAccess(slug: string, userId: string): Promise<ServerAccessRow | null> {
  const rows = await prisma.$queryRaw<ServerAccessRow[]>`
    SELECT s.id AS serverId, s.ownerId,
      (
        SELECT role
        FROM FivemServerMember m
        WHERE m.serverId = s.id AND m.userId = ${userId} AND m.status = 'ACTIVE'
        LIMIT 1
      ) AS role
    FROM FivemServer s
    WHERE s.slug = ${slug}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

function isServerAdmin(access: ServerAccessRow, userId: string): boolean {
  return access.ownerId === userId || access.role === "ADMIN" || access.role === "MODERATOR";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureFivemTables();
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { slug: rawSlug } = await params;
    const slug = normalizeFivemSlug(rawSlug);
    const access = await getServerAccess(slug, user.id);
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    const isAdmin = isServerAdmin(access, user.id);
    const applications = isAdmin
      ? await prisma.$queryRaw<ApplicationRow[]>`
          SELECT a.id, a.userId, u.username, u.displayName, a.type, a.targetName, a.message, a.status, a.paidCredits, a.reviewedNote, a.createdAt
          FROM FivemServerApplication a
          INNER JOIN User u ON u.id = a.userId
          WHERE a.serverId = ${access.serverId}
          ORDER BY a.createdAt DESC
          LIMIT 300
        `
      : await prisma.$queryRaw<ApplicationRow[]>`
          SELECT a.id, a.userId, u.username, u.displayName, a.type, a.targetName, a.message, a.status, a.paidCredits, a.reviewedNote, a.createdAt
          FROM FivemServerApplication a
          INNER JOIN User u ON u.id = a.userId
          WHERE a.serverId = ${access.serverId} AND a.userId = ${user.id}
          ORDER BY a.createdAt DESC
          LIMIT 50
        `;

    const feeRows = await prisma.$queryRaw<{ jobApplicationFeeCredits: number; ruleApplicationFeeCredits: number }[]>`
      SELECT jobApplicationFeeCredits, ruleApplicationFeeCredits
      FROM FivemServerFeeConfig
      WHERE serverId = ${access.serverId}
      LIMIT 1
    `;
    const fees = feeRows[0] ?? { jobApplicationFeeCredits: 0, ruleApplicationFeeCredits: 0 };

    return NextResponse.json({ applications, fees, isAdmin });
  } catch (error) {
    console.error("GET /api/fivem/servers/[slug]/applications error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureFivemTables();
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { slug: rawSlug } = await params;
    const slug = normalizeFivemSlug(rawSlug);
    const access = await getServerAccess(slug, user.id);
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    const type = String(body?.type || "").toUpperCase();
    const targetName = String(body?.targetName || "").trim();
    const message = String(body?.message || "").trim();
    if (!["JOB", "RULE"].includes(type) || !targetName) {
      return NextResponse.json({ error: "type (JOB/RULE) and targetName are required" }, { status: 400 });
    }

    const feesRows = await prisma.$queryRaw<{ jobApplicationFeeCredits: number; ruleApplicationFeeCredits: number }[]>`
      SELECT jobApplicationFeeCredits, ruleApplicationFeeCredits
      FROM FivemServerFeeConfig
      WHERE serverId = ${access.serverId}
      LIMIT 1
    `;
    const fees = feesRows[0] ?? { jobApplicationFeeCredits: 0, ruleApplicationFeeCredits: 0 };
    const feeCredits = type === "JOB" ? fees.jobApplicationFeeCredits : fees.ruleApplicationFeeCredits;

    const appIdRows = await prisma.$queryRaw<{ id: string }[]>`SELECT UUID() AS id`;
    const feedIdRows = await prisma.$queryRaw<{ id: string }[]>`SELECT UUID() AS id`;
    const appId = appIdRows[0]?.id;
    const feedId = feedIdRows[0]?.id;
    if (!appId || !feedId) return NextResponse.json({ error: "Unable to allocate ids" }, { status: 500 });

    await prisma.$transaction(async (tx) => {
      if (feeCredits > 0) {
        const payerTx = await tx.transaction.create({
          data: {
            userId: user.id,
            type: "SERVICE_PAYMENT",
            amountCents: feeCredits,
            credits: -feeCredits,
            description: `FiveM ${type} application fee (${targetName})`,
            status: "COMPLETED",
          },
        });
        await payWithPlatformCut({
          tx,
          payerUserId: user.id,
          ownerUserId: access.ownerId,
          totalCredits: feeCredits,
          referenceId: `fivem-app-fee:${payerTx.id}`,
          description: `Paid ${type} application fee for ${targetName}`,
          payerUsername: user.username,
        });
      }

      await tx.$executeRaw`
        INSERT INTO FivemServerApplication
        (id, serverId, userId, type, targetName, message, status, paidCredits, createdAt, updatedAt)
        VALUES
        (${appId}, ${access.serverId}, ${user.id}, ${type}, ${targetName.slice(0, 120)}, ${message.slice(0, 2000)}, ${"PENDING"}, ${feeCredits}, ${new Date()}, ${new Date()})
      `;

      await tx.$executeRaw`
        INSERT INTO FivemServerFeed
        (id, serverId, type, title, body, createdAt)
        VALUES
        (${feedId}, ${access.serverId}, ${"APPLICATION_SUBMITTED"}, ${`${type} application submitted`}, ${`${user.displayName} requested ${targetName}`}, ${new Date()})
      `;
    });

    return NextResponse.json({ ok: true, feeCredits });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message.includes("Insufficient credits")) {
      return NextResponse.json({ error: "Insufficient credits for application fee." }, { status: 402 });
    }
    console.error("POST /api/fivem/servers/[slug]/applications error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureFivemTables();
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { slug: rawSlug } = await params;
    const slug = normalizeFivemSlug(rawSlug);
    const access = await getServerAccess(slug, user.id);
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });
    if (!isServerAdmin(access, user.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    const applicationId = String(body?.applicationId || "").trim();
    const status = String(body?.status || "").toUpperCase();
    const reviewedNote = String(body?.reviewedNote || "").trim();
    if (!applicationId || !["APPROVED", "REJECTED"].includes(status)) {
      return NextResponse.json({ error: "applicationId and status APPROVED/REJECTED are required" }, { status: 400 });
    }

    const appRows = await prisma.$queryRaw<{ id: string; type: string; targetName: string; userId: string }[]>`
      SELECT id, type, targetName, userId
      FROM FivemServerApplication
      WHERE id = ${applicationId} AND serverId = ${access.serverId}
      LIMIT 1
    `;
    const app = appRows[0];
    if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });

    const feedIdRows = await prisma.$queryRaw<{ id: string }[]>`SELECT UUID() AS id`;
    const feedId = feedIdRows[0]?.id;
    if (!feedId) return NextResponse.json({ error: "Unable to create feed id" }, { status: 500 });

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE FivemServerApplication
        SET status = ${status}, reviewedBy = ${user.id}, reviewedNote = ${reviewedNote.slice(0, 2000)}, updatedAt = ${new Date()}
        WHERE id = ${applicationId}
      `;
      await tx.$executeRaw`
        INSERT INTO FivemServerFeed
        (id, serverId, type, title, body, createdAt)
        VALUES
        (${feedId}, ${access.serverId}, ${status === "APPROVED" ? "APPLICATION_APPROVED" : "APPLICATION_REJECTED"},
         ${`${app.type} application ${status.toLowerCase()}`},
         ${`${app.targetName} for user ${app.userId} was ${status.toLowerCase()}`},
         ${new Date()})
      `;
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/fivem/servers/[slug]/applications error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
