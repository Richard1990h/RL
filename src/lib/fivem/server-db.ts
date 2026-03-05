import { prisma } from "@/lib/db";
import crypto from "crypto";
import { NextRequest } from "next/server";

export const FIVEM_MEMBER_ROLES = ["ADMIN", "MODERATOR", "USER"] as const;
export type FivemMemberRole = (typeof FIVEM_MEMBER_ROLES)[number];

const TABLE_DEFS: string[] = [
  `
    CREATE TABLE IF NOT EXISTS \`FivemServer\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`ownerId\` VARCHAR(191) NOT NULL,
      \`slug\` VARCHAR(191) NOT NULL,
      \`name\` VARCHAR(191) NOT NULL,
      \`websiteName\` VARCHAR(191) NOT NULL,
      \`summary\` TEXT NULL,
      \`description\` TEXT NULL,
      \`logoUrl\` TEXT NULL,
      \`coverUrl\` TEXT NULL,
      \`discordInviteUrl\` TEXT NULL,
      \`discordGuildId\` VARCHAR(191) NULL,
      \`discordMemberCount\` INT NOT NULL DEFAULT 0,
      \`onlinePlayers\` INT NOT NULL DEFAULT 0,
      \`maxPlayers\` INT NOT NULL DEFAULT 64,
      \`whitelistOpen\` BOOLEAN NOT NULL DEFAULT false,
      \`isPublished\` BOOLEAN NOT NULL DEFAULT true,
      \`tags\` JSON NULL,
      \`settings\` JSON NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`FivemServer_slug_key\` (\`slug\`),
      INDEX \`FivemServer_ownerId_idx\` (\`ownerId\`),
      INDEX \`FivemServer_isPublished_idx\` (\`isPublished\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `,
  `
    CREATE TABLE IF NOT EXISTS \`FivemServerMember\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`serverId\` VARCHAR(191) NOT NULL,
      \`userId\` VARCHAR(191) NOT NULL,
      \`role\` VARCHAR(32) NOT NULL DEFAULT 'USER',
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`FivemServerMember_serverId_userId_key\` (\`serverId\`, \`userId\`),
      INDEX \`FivemServerMember_userId_idx\` (\`userId\`),
      INDEX \`FivemServerMember_serverId_role_idx\` (\`serverId\`, \`role\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `,
  `
    CREATE TABLE IF NOT EXISTS \`FivemServerJob\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`serverId\` VARCHAR(191) NOT NULL,
      \`title\` VARCHAR(191) NOT NULL,
      \`description\` TEXT NULL,
      \`whitelistOnly\` BOOLEAN NOT NULL DEFAULT false,
      \`isActive\` BOOLEAN NOT NULL DEFAULT true,
      \`sortOrder\` INT NOT NULL DEFAULT 0,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`FivemServerJob_serverId_isActive_idx\` (\`serverId\`, \`isActive\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `,
  `
    CREATE TABLE IF NOT EXISTS \`FivemServerPage\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`serverId\` VARCHAR(191) NOT NULL,
      \`slug\` VARCHAR(191) NOT NULL,
      \`title\` VARCHAR(191) NOT NULL,
      \`content\` JSON NULL,
      \`isVisible\` BOOLEAN NOT NULL DEFAULT true,
      \`sortOrder\` INT NOT NULL DEFAULT 0,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`FivemServerPage_serverId_slug_key\` (\`serverId\`, \`slug\`),
      INDEX \`FivemServerPage_serverId_sortOrder_idx\` (\`serverId\`, \`sortOrder\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `,
  `
    CREATE TABLE IF NOT EXISTS \`FivemServerVipPackage\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`serverId\` VARCHAR(191) NOT NULL,
      \`name\` VARCHAR(191) NOT NULL,
      \`description\` TEXT NULL,
      \`priceCredits\` INT NOT NULL,
      \`durationDays\` INT NOT NULL DEFAULT 30,
      \`benefits\` JSON NULL,
      \`isActive\` BOOLEAN NOT NULL DEFAULT true,
      \`sortOrder\` INT NOT NULL DEFAULT 0,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`FivemServerVipPackage_serverId_isActive_idx\` (\`serverId\`, \`isActive\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `,
  `
    CREATE TABLE IF NOT EXISTS \`FivemServerVipPurchase\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`serverId\` VARCHAR(191) NOT NULL,
      \`packageId\` VARCHAR(191) NOT NULL,
      \`userId\` VARCHAR(191) NOT NULL,
      \`creditsPaid\` INT NOT NULL,
      \`startsAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`expiresAt\` DATETIME(3) NOT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`FivemServerVipPurchase_serverId_userId_status_idx\` (\`serverId\`, \`userId\`, \`status\`),
      INDEX \`FivemServerVipPurchase_packageId_idx\` (\`packageId\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `,
  `
    CREATE TABLE IF NOT EXISTS \`FivemWebsiteSubscription\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`userId\` VARCHAR(191) NOT NULL,
      \`serverId\` VARCHAR(191) NOT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
      \`amountCents\` INT NOT NULL,
      \`billingPeriod\` VARCHAR(32) NOT NULL DEFAULT 'MONTHLY',
      \`paypalOrderId\` VARCHAR(191) NULL,
      \`paypalCaptureId\` VARCHAR(191) NULL,
      \`startedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`nextBillingAt\` DATETIME(3) NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`FivemWebsiteSubscription_serverId_key\` (\`serverId\`),
      INDEX \`FivemWebsiteSubscription_userId_status_idx\` (\`userId\`, \`status\`),
      INDEX \`FivemWebsiteSubscription_nextBillingAt_idx\` (\`nextBillingAt\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `,
  `
    CREATE TABLE IF NOT EXISTS \`FivemServerFeeConfig\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`serverId\` VARCHAR(191) NOT NULL,
      \`jobApplicationFeeCredits\` INT NOT NULL DEFAULT 0,
      \`ruleApplicationFeeCredits\` INT NOT NULL DEFAULT 0,
      \`vipFeePct\` INT NOT NULL DEFAULT 10,
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`FivemServerFeeConfig_serverId_key\` (\`serverId\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `,
  `
    CREATE TABLE IF NOT EXISTS \`FivemServerApplication\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`serverId\` VARCHAR(191) NOT NULL,
      \`userId\` VARCHAR(191) NOT NULL,
      \`type\` VARCHAR(32) NOT NULL,
      \`targetName\` VARCHAR(191) NOT NULL,
      \`message\` TEXT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
      \`paidCredits\` INT NOT NULL DEFAULT 0,
      \`reviewedBy\` VARCHAR(191) NULL,
      \`reviewedNote\` TEXT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`FivemServerApplication_serverId_status_idx\` (\`serverId\`, \`status\`),
      INDEX \`FivemServerApplication_userId_idx\` (\`userId\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `,
  `
    CREATE TABLE IF NOT EXISTS \`FivemServerFeed\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`serverId\` VARCHAR(191) NOT NULL,
      \`type\` VARCHAR(32) NOT NULL,
      \`title\` VARCHAR(191) NOT NULL,
      \`body\` TEXT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`FivemServerFeed_serverId_createdAt_idx\` (\`serverId\`, \`createdAt\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `,
  `
    CREATE TABLE IF NOT EXISTS \`FivemBugReport\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`serverId\` VARCHAR(191) NOT NULL,
      \`playerName\` VARCHAR(100) NOT NULL,
      \`playerId\` VARCHAR(100) NULL,
      \`title\` VARCHAR(200) NOT NULL,
      \`description\` TEXT NOT NULL,
      \`stepsToRepro\` TEXT NOT NULL,
      \`expected\` TEXT NULL,
      \`severity\` VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
      \`location\` VARCHAR(200) NULL,
      \`adminNotes\` TEXT NULL,
      \`screenshots\` JSON NULL,
      \`diagnosis\` TEXT NULL,
      \`fixPlan\` TEXT NULL,
      \`fixResult\` TEXT NULL,
      \`testResult\` TEXT NULL,
      \`resolvedAt\` DATETIME(3) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`FivemBugReport_serverId_status_idx\` (\`serverId\`, \`status\`),
      INDEX \`FivemBugReport_createdAt_idx\` (\`createdAt\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `,
  `
    CREATE TABLE IF NOT EXISTS \`FivemSuggestion\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`serverId\` VARCHAR(191) NOT NULL,
      \`playerName\` VARCHAR(100) NOT NULL,
      \`playerId\` VARCHAR(100) NULL,
      \`title\` VARCHAR(200) NOT NULL,
      \`description\` TEXT NOT NULL,
      \`howItWorks\` TEXT NOT NULL,
      \`whyItsGood\` TEXT NULL,
      \`priority\` VARCHAR(32) NOT NULL DEFAULT 'NICE_TO_HAVE',
      \`category\` VARCHAR(100) NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'NEW',
      \`adminNotes\` TEXT NULL,
      \`screenshots\` JSON NULL,
      \`votes\` INT NOT NULL DEFAULT 0,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`FivemSuggestion_serverId_status_idx\` (\`serverId\`, \`status\`),
      INDEX \`FivemSuggestion_createdAt_idx\` (\`createdAt\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `,
  `
    CREATE TABLE IF NOT EXISTS \`FivemPendingCommand\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`serverId\` VARCHAR(191) NOT NULL,
      \`type\` VARCHAR(32) NOT NULL DEFAULT 'ENSURE',
      \`resources\` JSON NOT NULL,
      \`folders\` VARCHAR(500) NULL,
      \`reason\` VARCHAR(500) NULL,
      \`sourceType\` VARCHAR(32) NULL,
      \`sourceId\` VARCHAR(191) NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`executedAt\` DATETIME(3) NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`FivemPendingCommand_serverId_status_idx\` (\`serverId\`, \`status\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `,
  `
    CREATE TABLE IF NOT EXISTS \`FivemPlayerReport\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`serverId\` VARCHAR(191) NOT NULL,
      \`reporterName\` VARCHAR(100) NOT NULL,
      \`reporterId\` VARCHAR(100) NULL,
      \`reportedPlayer\` VARCHAR(100) NOT NULL,
      \`reasons\` JSON NOT NULL,
      \`description\` TEXT NOT NULL,
      \`screenshots\` JSON NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
      \`adminNotes\` TEXT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`FivemPlayerReport_serverId_status_idx\` (\`serverId\`, \`status\`),
      INDEX \`FivemPlayerReport_reporterId_idx\` (\`reporterId\`),
      INDEX \`FivemPlayerReport_createdAt_idx\` (\`createdAt\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `,
  `
    CREATE TABLE IF NOT EXISTS \`FivemAdminComment\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`serverId\` VARCHAR(191) NOT NULL,
      \`targetType\` VARCHAR(32) NOT NULL,
      \`targetId\` VARCHAR(191) NOT NULL,
      \`authorName\` VARCHAR(200) NOT NULL,
      \`authorId\` VARCHAR(191) NOT NULL,
      \`text\` TEXT NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`FivemAdminComment_serverId_targetType_targetId_idx\` (\`serverId\`, \`targetType\`, \`targetId\`),
      INDEX \`FivemAdminComment_createdAt_idx\` (\`createdAt\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `,
];

const MIGRATIONS: string[] = [
  `ALTER TABLE FivemSuggestion ADD COLUMN category VARCHAR(100) NULL AFTER priority`,
  `ALTER TABLE FivemBugReport ADD COLUMN diagnosis TEXT NULL`,
  `ALTER TABLE FivemBugReport ADD COLUMN fixPlan TEXT NULL`,
  `ALTER TABLE FivemBugReport ADD COLUMN fixResult TEXT NULL`,
  `ALTER TABLE FivemBugReport ADD COLUMN testResult TEXT NULL`,
  `ALTER TABLE FivemBugReport ADD COLUMN resolvedAt DATETIME(3) NULL`,
  `ALTER TABLE FivemServer ADD COLUMN lastHeartbeatAt DATETIME(3) NULL`,
  `ALTER TABLE FivemSuggestion ADD COLUMN screenshots JSON NULL AFTER adminNotes`,
  `ALTER TABLE FivemBugReport ADD COLUMN screenshots JSON NULL AFTER adminNotes`,
  `ALTER TABLE FivemSuggestion ADD COLUMN analysis TEXT NULL`,
  `ALTER TABLE FivemSuggestion ADD COLUMN implementationPlan TEXT NULL`,
  `ALTER TABLE FivemSuggestion ADD COLUMN implementationResult TEXT NULL`,
  `ALTER TABLE FivemSuggestion ADD COLUMN verifyResult TEXT NULL`,
  `ALTER TABLE FivemSuggestion ADD COLUMN resolvedAt DATETIME(3) NULL`,
  `ALTER TABLE FivemBugReport ADD COLUMN lastAiProcessedAt DATETIME(3) NULL`,
  `ALTER TABLE FivemSuggestion ADD COLUMN lastAiProcessedAt DATETIME(3) NULL`,
  `ALTER TABLE FivemServer ADD COLUMN apiKey VARCHAR(64) NULL`,
  `CREATE UNIQUE INDEX FivemServer_apiKey_key ON FivemServer (apiKey)`,
  `ALTER TABLE FivemServer ADD COLUMN resourcesLocalPath VARCHAR(500) NULL`,
  `ALTER TABLE FivemPendingCommand ADD COLUMN folders VARCHAR(500) NULL AFTER resources`,
  `ALTER TABLE FivemServer ADD COLUMN lastBackupAt DATETIME(3) NULL`,
];

export async function ensureFivemTables() {
  for (const statement of TABLE_DEFS) {
    await prisma.$executeRawUnsafe(statement);
  }
  for (const migration of MIGRATIONS) {
    try {
      await prisma.$executeRawUnsafe(migration);
    } catch {
      // Column/table already exists — safe to ignore
    }
  }
}

export function normalizeFivemSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function isValidMemberRole(value: string): value is FivemMemberRole {
  return (FIVEM_MEMBER_ROLES as readonly string[]).includes(value);
}

/** Generate a random 48-char hex API key */
export function generateApiKey(): string {
  return crypto.randomBytes(24).toString("hex");
}

/**
 * Validate FiveM server API key from X-Api-Key header.
 * If API key is provided, validates it. If not, falls back to slug-only lookup.
 * This allows older HK-debug versions (without API key support) to still connect.
 * Returns the server record on success, or an error object on failure.
 */
export async function validateFivemApiKey(
  slug: string,
  request: NextRequest,
): Promise<
  | { server: { id: string; ownerId: string }; error?: undefined; status?: undefined }
  | { error: string; status: number; server?: undefined }
> {
  const apiKey = request.headers.get("x-api-key");

  // Always look up by slug first
  const servers = await prisma.$queryRaw<{ id: string; ownerId: string; apiKey: string | null }[]>`
    SELECT id, ownerId, apiKey FROM FivemServer WHERE slug = ${slug} LIMIT 1
  `;
  if (!servers[0]) {
    return { error: "Server not found", status: 404 };
  }

  const server = servers[0];

  if (apiKey) {
    // Client sent a key — validate it IF the server has a key set
    if (server.apiKey && server.apiKey !== apiKey) {
      return { error: "Invalid API key", status: 401 };
    }
    // Key matches, or server has no key set yet (accept any key from client)
  }

  return { server: { id: server.id, ownerId: server.ownerId } };
}
