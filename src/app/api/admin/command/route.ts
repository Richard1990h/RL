import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOwnerWithDevice } from "@/lib/auth";
import { insertLedgerEntry } from "@/lib/credit-ledger";
import { logAudit } from "@/lib/user-storage";

function parseCommand(input: string): { action: string; params: Record<string, string> } {
  const trimmed = input.trim();
  const parts = trimmed.split(/\s+/);
  const action = parts[0]?.toLowerCase() || "";

  const params: Record<string, string> = {};
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part.includes(":")) {
      const [key, ...valueParts] = part.split(":");
      params[key] = valueParts.join(":");
    } else {
      // Handle multi-word actions like "give credits"
      if (i === 1 && !part.includes(":")) {
        return parseCommand(`${action}${part} ${parts.slice(2).join(" ")}`);
      }
    }
  }

  return { action, params };
}

async function findUser(username: string) {
  return prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    include: { wallet: true },
  });
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireOwnerWithDevice();

    const body = await req.json();
    const { command } = body;

    if (!command || typeof command !== "string") {
      return NextResponse.json({
        success: false,
        message: "No command provided",
      });
    }

    const trimmed = command.trim();
    const parts = trimmed.split(/\s+/);
    const action = parts[0]?.toLowerCase() || "";

    // ── ban user:<username> ──
    if (action === "ban") {
      const { params } = parseCommand(trimmed);
      const username = params.user;
      if (!username) {
        return NextResponse.json({
          success: false,
          message: 'Usage: ban user:<username>',
        });
      }
      const target = await findUser(username);
      if (!target) {
        return NextResponse.json({ success: false, message: `User "${username}" not found` });
      }
      if (target.isOwner) {
        return NextResponse.json({ success: false, message: "Cannot ban the owner" });
      }
      await prisma.user.update({ where: { id: target.id }, data: { isBanned: true } });
      return NextResponse.json({
        success: true,
        message: `User @${username} has been banned.`,
      });
    }

    // ── unban user:<username> ──
    if (action === "unban") {
      const { params } = parseCommand(trimmed);
      const username = params.user;
      if (!username) {
        return NextResponse.json({ success: false, message: 'Usage: unban user:<username>' });
      }
      const target = await findUser(username);
      if (!target) {
        return NextResponse.json({ success: false, message: `User "${username}" not found` });
      }
      await prisma.user.update({ where: { id: target.id }, data: { isBanned: false } });
      return NextResponse.json({
        success: true,
        message: `User @${username} has been unbanned.`,
      });
    }

    // ── verify user:<username> ──
    if (action === "verify") {
      const { params } = parseCommand(trimmed);
      const username = params.user;
      if (!username) {
        return NextResponse.json({ success: false, message: 'Usage: verify user:<username>' });
      }
      const target = await findUser(username);
      if (!target) {
        return NextResponse.json({ success: false, message: `User "${username}" not found` });
      }
      await prisma.user.update({ where: { id: target.id }, data: { verifiedBadge: true } });
      return NextResponse.json({
        success: true,
        message: `User @${username} is now verified.`,
      });
    }

    // ── unverify user:<username> ──
    if (action === "unverify") {
      const { params } = parseCommand(trimmed);
      const username = params.user;
      if (!username) {
        return NextResponse.json({ success: false, message: 'Usage: unverify user:<username>' });
      }
      const target = await findUser(username);
      if (!target) {
        return NextResponse.json({ success: false, message: `User "${username}" not found` });
      }
      await prisma.user.update({ where: { id: target.id }, data: { verifiedBadge: false } });
      return NextResponse.json({
        success: true,
        message: `User @${username} verification removed.`,
      });
    }

    // ── check credits user:<username> ──
    if (action === "check") {
      const { params } = parseCommand(trimmed);
      const username = params.user;
      if (!username) {
        return NextResponse.json({ success: false, message: 'Usage: check credits user:<username>' });
      }
      const target = await findUser(username);
      if (!target) {
        return NextResponse.json({ success: false, message: `User "${username}" not found` });
      }
      const recentTransactions = await prisma.transaction.findMany({
        where: { userId: target.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      return NextResponse.json({
        success: true,
        message: `Credit report for @${username}`,
        data: {
          username: target.username,
          displayName: target.displayName,
          walletCredits: target.wallet?.credits ?? 0,
          totalEarned: target.wallet?.totalEarned ?? 0,
          totalSpent: target.wallet?.totalSpent ?? 0,
          recentTransactions: recentTransactions.map((t) => ({
            type: t.type,
            credits: t.credits,
            amountCents: t.amountCents,
            description: t.description,
            status: t.status,
            createdAt: t.createdAt,
          })),
        },
      });
    }

    // ── stats ──
    if (action === "stats") {
      const [totalUsers, totalVideos, totalCredits, totalRevenue, activeStreams] =
        await Promise.all([
          prisma.user.count(),
          prisma.video.count(),
          prisma.wallet.aggregate({ _sum: { credits: true } }),
          prisma.wallet.aggregate({ _sum: { totalEarned: true } }),
          prisma.liveStream.count({ where: { status: "LIVE" } }),
        ]);
      return NextResponse.json({
        success: true,
        message: "Platform Statistics",
        data: {
          totalUsers,
          totalVideos,
          totalCreditsInCirculation: totalCredits._sum.credits ?? 0,
          totalRevenueCents: totalRevenue._sum.totalEarned ?? 0,
          activeStreams,
        },
      });
    }

    // ── give credits user:<username> amount:<number> ──
    if (action === "give") {
      const { params } = parseCommand(trimmed);
      const username = params.user;
      const amount = parseInt(params.amount || "0");
      if (!username || !amount || amount <= 0) {
        return NextResponse.json({
          success: false,
          message: 'Usage: give credits user:<username> amount:<number>',
        });
      }
      const target = await findUser(username);
      if (!target) {
        return NextResponse.json({ success: false, message: `User "${username}" not found` });
      }
      if (!target.wallet) {
        return NextResponse.json({ success: false, message: `User "${username}" has no wallet` });
      }
      await prisma.$transaction(async (tx) => {
        const txRecord = await tx.transaction.create({
          data: {
            userId: target.id,
            type: "CREDIT_EARNED",
            amountCents: 0,
            credits: amount,
            description: `Admin granted ${amount} credits`,
            status: "COMPLETED",
          },
        });

        await insertLedgerEntry(tx, {
          userId: target.id,
          deltaCredits: amount,
          type: "ADMIN_GRANT",
          referenceId: txRecord.id,
          description: `Admin granted ${amount} credits`,
        });
      });

      try {
        await logAudit(target.email, "credits", {
          amount,
          method: "admin_grant",
          grantedBy: currentUser!.username,
        });
      } catch {} // Non-fatal

      return NextResponse.json({
        success: true,
        message: `Granted ${amount} credits to @${username}. New balance: ${target.wallet.credits + amount} credits.`,
      });
    }

    // ── reset wallet user:<username> ──
    if (action === "reset") {
      const { params } = parseCommand(trimmed);
      const username = params.user;
      if (!username) {
        return NextResponse.json({ success: false, message: 'Usage: reset wallet user:<username>' });
      }
      const target = await findUser(username);
      if (!target) {
        return NextResponse.json({ success: false, message: `User "${username}" not found` });
      }
      if (target.isOwner) {
        return NextResponse.json({ success: false, message: "Cannot reset owner wallet" });
      }
      if (!target.wallet) {
        return NextResponse.json({ success: false, message: `User "${username}" has no wallet` });
      }
      const currentCredits = target.wallet.credits;
      await prisma.$transaction(async (tx) => {
        if (currentCredits > 0) {
          await insertLedgerEntry(tx, {
            userId: target.id,
            deltaCredits: -currentCredits,
            type: "ADJUSTMENT",
            referenceId: `admin_reset_${target.id}_${Date.now()}`,
            description: `Admin reset wallet to zero (was ${currentCredits} credits)`,
          });
        }
        await tx.wallet.update({
          where: { id: target.wallet!.id },
          data: { totalEarned: 0, totalSpent: 0 },
        });
      });
      return NextResponse.json({
        success: true,
        message: `Wallet for @${username} has been reset to zero.`,
      });
    }

    // ── users ──
    if (action === "users") {
      const users = await prisma.user.findMany({
        select: {
          username: true,
          displayName: true,
          email: true,
          isCreator: true,
          verifiedBadge: true,
          isBanned: true,
          isOwner: true,
          followerCount: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return NextResponse.json({
        success: true,
        message: `Showing ${users.length} users`,
        data: users,
      });
    }

    // ── alerts ──
    if (action === "alerts") {
      const alerts = await prisma.notification.findMany({
        where: { type: "SYSTEM" },
        orderBy: { createdAt: "desc" },
        take: 25,
        include: { user: { select: { username: true, displayName: true } } },
      });
      return NextResponse.json({
        success: true,
        message: `${alerts.length} recent system alerts`,
        data: alerts,
      });
    }

    // ── setrole user:<username> role:<OWNER|BUG_TESTER|END_USER> ──
    if (action === "setrole") {
      const { params } = parseCommand(trimmed);
      const username = params.user;
      const role = params.role?.toUpperCase();
      const validRoles = ["OWNER", "BUG_TESTER", "END_USER"];
      if (!username || !role || !validRoles.includes(role)) {
        return NextResponse.json({
          success: false,
          message: `Usage: setrole user:<username> role:<${validRoles.join("|")}>`,
        });
      }
      const target = await findUser(username);
      if (!target) {
        return NextResponse.json({ success: false, message: `User "${username}" not found` });
      }
      if (target.isOwner && role !== "OWNER" && role !== "BUG_TESTER") {
        return NextResponse.json({ success: false, message: "Owner can only switch between OWNER and BUG_TESTER" });
      }
      if (role === "OWNER" && !target.isOwner) {
        return NextResponse.json({ success: false, message: "Cannot assign OWNER role to another user" });
      }
      await prisma.user.update({ where: { id: target.id }, data: { role: role as any } });
      return NextResponse.json({
        success: true,
        message: `User @${username} role set to ${role}.`,
      });
    }

    // ── help ──
    if (action === "help") {
      return NextResponse.json({
        success: true,
        message: [
          "Available Commands:",
          "  ban user:<username>           - Ban a user",
          "  unban user:<username>         - Unban a user",
          "  verify user:<username>        - Give verification badge",
          "  unverify user:<username>      - Remove verification badge",
          "  setrole user:<username> role:<OWNER|BUG_TESTER|END_USER> - Set user role",
          "  check credits user:<username> - View credit report",
          "  give credits user:<username> amount:<number> - Grant credits",
          "  reset wallet user:<username>  - Reset wallet to zero",
          "  stats                         - Platform statistics",
          "  users                         - List all users",
          "  alerts                        - Recent system alerts",
          "  help                          - Show this help",
        ].join("\n"),
      });
    }

    return NextResponse.json({
      success: false,
      message: `Unknown command: "${action}". Type "help" for available commands.`,
    });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (error?.message === "Forbidden" || error?.message === "Device not allowed") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("Admin command error:", error);
    return NextResponse.json({
      success: false,
      message: `Error executing command: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}
