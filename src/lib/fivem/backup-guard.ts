import { prisma } from "@/lib/db";
import { randomUUID } from "crypto";

const BACKUP_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

/**
 * Shared backup guard — used by both bugs and suggestions routes.
 * Returns null if backup is recent enough, or an error message if not.
 */
export async function requireRecentBackup(serverId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ lastBackupAt: Date | null }[]>`
    SELECT lastBackupAt FROM FivemServer WHERE id = ${serverId} LIMIT 1
  `;
  const lastBackup = rows[0]?.lastBackupAt;
  if (!lastBackup) {
    return "No backup found. Please run a backup from the dashboard before making changes.";
  }
  const age = Date.now() - new Date(lastBackup).getTime();
  if (age > BACKUP_MAX_AGE_MS) {
    const mins = Math.round(age / 60000);
    return `Last backup is ${mins} minutes old (max 60 min). Please run a new backup before making changes.`;
  }
  return null;
}

/** Queue a BACKUP command for the server. Returns the command ID. */
export async function queueBackup(serverId: string): Promise<string> {
  const cmdId = randomUUID();
  const now = new Date();
  await prisma.$executeRaw`
    INSERT INTO FivemPendingCommand (id, serverId, type, resources, reason, status, createdAt)
    VALUES (${cmdId}, ${serverId}, 'BACKUP', '[]', 'Auto-backup before AI action', 'PENDING', ${now})
  `;
  return cmdId;
}
