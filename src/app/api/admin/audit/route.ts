import { NextRequest, NextResponse } from "next/server";
import { requireOwnerWithDevice } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deriveKey, decryptAuditFile } from "@/lib/audit";
import { USER_STORAGE_ROOT } from "@/lib/user-storage";
import path from "path";

const VALID_TYPES = ["emails", "usernames", "displaynames", "credits", "login_attempts", "age", "all"];

export async function GET(req: NextRequest) {
  try {
    await requireOwnerWithDevice();

    const email = req.nextUrl.searchParams.get("email");
    const type = req.nextUrl.searchParams.get("type") || "all";

    if (!email) {
      return NextResponse.json({ error: "email query parameter is required" }, { status: 400 });
    }

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` }, { status: 400 });
    }

    // Get the user's password hash to derive decryption key
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { passwordHash: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const key = deriveKey(user.passwordHash);
    const auditDir = path.join(USER_STORAGE_ROOT, email.toLowerCase(), "_audit");

    if (type === "all") {
      const allEntries: Record<string, unknown[]> = {};
      for (const t of VALID_TYPES.filter((t) => t !== "all")) {
        try {
          const entries = await decryptAuditFile(path.join(auditDir, `${t}.enc`), key);
          if (entries.length > 0) {
            allEntries[t] = entries;
          }
        } catch {
          // File doesn't exist or can't be decrypted — skip
        }
      }
      return NextResponse.json({ email, entries: allEntries });
    }

    const entries = await decryptAuditFile(path.join(auditDir, `${type}.enc`), key);
    return NextResponse.json({ email, type, entries });
  } catch (error: any) {
    if (error?.message === "Unauthorized" || error?.message === "Forbidden" || error?.message === "Device not allowed") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("Admin audit error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
