import crypto from "crypto";
import fs from "fs/promises";

const ALGORITHM = "aes-256-gcm";
const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 32; // 256 bits
const SALT = "rally-audit-salt-v1"; // Static salt — key uniqueness comes from passwordHash

/**
 * Derive an AES-256 key from the owner's bcrypt password hash using PBKDF2.
 */
export function deriveKey(ownerPasswordHash: string): Buffer {
  return crypto.pbkdf2Sync(
    ownerPasswordHash,
    SALT,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    "sha512"
  );
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns `{iv}:{authTag}:{ciphertext}` in base64.
 */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

/**
 * Decrypt an `{iv}:{authTag}:{ciphertext}` string with AES-256-GCM.
 */
export function decrypt(encryptedStr: string, key: Buffer): string {
  const [ivB64, authTagB64, ciphertext] = encryptedStr.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export interface AuditEntry {
  timestamp: string;
  type: string;
  data: Record<string, unknown>;
}

/**
 * Read and decrypt an audit file. Returns an array of entries.
 * If the file doesn't exist, returns an empty array.
 */
export async function decryptAuditFile(
  filePath: string,
  key: Buffer
): Promise<AuditEntry[]> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    if (!raw.trim()) return [];
    const decrypted = decrypt(raw.trim(), key);
    return JSON.parse(decrypted) as AuditEntry[];
  } catch (err: any) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
}

/**
 * Decrypt an audit file, append a new entry, re-encrypt, and write back.
 */
export async function encryptAndAppend(
  filePath: string,
  entry: AuditEntry,
  key: Buffer
): Promise<void> {
  const entries = await decryptAuditFile(filePath, key);
  entries.push(entry);
  const encrypted = encrypt(JSON.stringify(entries), key);
  await fs.writeFile(filePath, encrypted, "utf-8");
}
