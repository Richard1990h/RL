import path from "path";
import fs from "fs/promises";
import { prisma } from "@/lib/db";
import { deriveKey, encryptAndAppend, type AuditEntry } from "@/lib/audit";

export const USER_STORAGE_ROOT =
  process.env.USER_STORAGE_ROOT || "L:/.youtube";

const SUBFOLDERS = ["videos", "streams", "conversations", "pictures", "_audit"];

/**
 * Create the standard folder structure for a user, keyed by email.
 */
export async function createUserFolders(email: string): Promise<void> {
  const userDir = path.join(USER_STORAGE_ROOT, email);
  for (const sub of SUBFOLDERS) {
    await fs.mkdir(path.join(userDir, sub), { recursive: true });
  }
}

/**
 * Rename a user's storage folder when their email changes.
 */
export async function renameUserFolder(
  oldEmail: string,
  newEmail: string
): Promise<void> {
  const oldDir = path.join(USER_STORAGE_ROOT, oldEmail);
  const newDir = path.join(USER_STORAGE_ROOT, newEmail);
  try {
    await fs.access(oldDir);
    await fs.rename(oldDir, newDir);
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      // Old folder doesn't exist — create new one instead
      await createUserFolders(newEmail);
    } else {
      throw err;
    }
  }
}

/**
 * Get the root path for a user's storage.
 */
export function getUserPath(email: string): string {
  return path.join(USER_STORAGE_ROOT, email);
}

export type AuditType =
  | "emails"
  | "usernames"
  | "displaynames"
  | "credits"
  | "login_attempts"
  | "age";

/**
 * Append an audit entry to the user's encrypted audit file.
 * Derives the encryption key from the user's password hash.
 */
export async function logAudit(
  email: string,
  type: AuditType,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { passwordHash: true },
    });
    if (!user) return;

    const key = deriveKey(user.passwordHash);
    const auditDir = path.join(USER_STORAGE_ROOT, email, "_audit");
    await fs.mkdir(auditDir, { recursive: true });

    const filePath = path.join(auditDir, `${type}.enc`);
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      type,
      data,
    };

    await encryptAndAppend(filePath, entry, key);
  } catch (err) {
    // Audit logging is non-fatal — never block the main operation
    console.error(`[audit] Failed to log ${type} for ${email}:`, err);
  }
}
