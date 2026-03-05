import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

async function ensureWhitelistTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS FivemWhitelistApplication (
      id VARCHAR(191) NOT NULL,
      displayName VARCHAR(191) NOT NULL,
      discordTag VARCHAR(191) NOT NULL,
      email VARCHAR(191) NULL,
      age INT NOT NULL,
      timezone VARCHAR(191) NOT NULL,
      department VARCHAR(32) NOT NULL,
      availability TEXT NOT NULL,
      experience TEXT NOT NULL,
      scenarioResponse TEXT NOT NULL,
      motivation TEXT NOT NULL,
      knowsRules BOOLEAN NOT NULL DEFAULT false,
      agreesToPolicy BOOLEAN NOT NULL DEFAULT false,
      hasWorkingMic BOOLEAN NOT NULL DEFAULT false,
      status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
      reviewerNotes TEXT NULL,
      reviewedAt DATETIME(3) NULL,
      reviewedBy VARCHAR(191) NULL,
      ipHash VARCHAR(191) NULL,
      userAgent TEXT NULL,
      createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      INDEX FivemWhitelistApplication_status_idx (status),
      INDEX FivemWhitelistApplication_discordTag_idx (discordTag),
      INDEX FivemWhitelistApplication_createdAt_idx (createdAt)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `;
}

function ipHashFromRequest(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(ip).digest("hex");
}

function normalizeLineBreaks(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user?.isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await ensureWhitelistTable();
    const applications = await prisma.$queryRaw<
      {
        id: string;
        displayName: string;
        discordTag: string;
        email: string | null;
        age: number;
        timezone: string;
        department: string;
        status: string;
        createdAt: Date;
      }[]
    >`SELECT id, displayName, discordTag, email, age, timezone, department, status, createdAt
      FROM FivemWhitelistApplication
      ORDER BY createdAt DESC
      LIMIT 200`;

    return NextResponse.json({ applications });
  } catch (error) {
    console.error("GET /api/fivem/whitelist failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureWhitelistTable();
    let body;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    const {
      displayName,
      discordTag,
      email,
      age,
      timezone,
      department,
      availability,
      experience,
      scenarioResponse,
      motivation,
      knowsRules,
      agreesToPolicy,
      hasWorkingMic,
      website, // honeypot
    } = body;

    if (website) {
      return NextResponse.json({ error: "Spam rejected" }, { status: 400 });
    }

    const requiredStrings = [
      displayName,
      discordTag,
      timezone,
      department,
      availability,
      experience,
      scenarioResponse,
      motivation,
    ];
    if (requiredStrings.some((v) => typeof v !== "string" || !v.trim())) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const parsedAge = Number(age);
    if (!Number.isFinite(parsedAge) || parsedAge < 15 || parsedAge > 90) {
      return NextResponse.json({ error: "Age must be between 15 and 90" }, { status: 400 });
    }

    const validDepartments = ["POLICE", "EMS", "FIREFIGHTER", "JUDGE", "LAWYER"];
    if (!validDepartments.includes(department)) {
      return NextResponse.json({ error: "Invalid department" }, { status: 400 });
    }

    if (!knowsRules || !agreesToPolicy || !hasWorkingMic) {
      return NextResponse.json({ error: "All acknowledgements are required" }, { status: 400 });
    }

    const cleanDisplayName = normalizeLineBreaks(displayName).slice(0, 80);
    const cleanDiscordTag = normalizeLineBreaks(discordTag).slice(0, 60);
    const cleanEmail = typeof email === "string" ? normalizeLineBreaks(email).slice(0, 180) : null;
    const cleanTimezone = normalizeLineBreaks(timezone).slice(0, 80);
    const cleanAvailability = normalizeLineBreaks(availability).slice(0, 2500);
    const cleanExperience = normalizeLineBreaks(experience).slice(0, 2500);
    const cleanScenario = normalizeLineBreaks(scenarioResponse).slice(0, 2500);
    const cleanMotivation = normalizeLineBreaks(motivation).slice(0, 2500);

    const ipHash = ipHashFromRequest(req);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [recentIpRows, recentDiscordRows] = await Promise.all([
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count
        FROM FivemWhitelistApplication
        WHERE ipHash = ${ipHash} AND createdAt >= ${oneHourAgo}
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count
        FROM FivemWhitelistApplication
        WHERE discordTag = ${cleanDiscordTag} AND createdAt >= ${oneDayAgo}
      `,
    ]);
    const recentIpCount = Number(recentIpRows[0]?.count || 0);
    const recentDiscordCount = Number(recentDiscordRows[0]?.count || 0);

    if (recentIpCount >= 3 || recentDiscordCount >= 2) {
      return NextResponse.json({ error: "Rate limit reached. Try again later." }, { status: 429 });
    }

    const idRows = await prisma.$queryRaw<{ id: string }[]>`SELECT UUID() as id`;
    const id = idRows[0]?.id;
    if (!id) {
      return NextResponse.json({ error: "Could not create application id" }, { status: 500 });
    }

    await prisma.$executeRaw`
      INSERT INTO FivemWhitelistApplication
      (id, displayName, discordTag, email, age, timezone, department, availability, experience, scenarioResponse, motivation, knowsRules, agreesToPolicy, hasWorkingMic, status, ipHash, userAgent, createdAt, updatedAt)
      VALUES
      (${id}, ${cleanDisplayName}, ${cleanDiscordTag}, ${cleanEmail || null}, ${parsedAge}, ${cleanTimezone}, ${department}, ${cleanAvailability}, ${cleanExperience}, ${cleanScenario}, ${cleanMotivation}, ${Boolean(knowsRules)}, ${Boolean(agreesToPolicy)}, ${Boolean(hasWorkingMic)}, ${"PENDING"}, ${ipHash}, ${req.headers.get("user-agent") || null}, ${new Date()}, ${new Date()})
    `;

    return NextResponse.json(
      { ok: true, application: { id, status: "PENDING", createdAt: new Date().toISOString() } },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/fivem/whitelist failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
