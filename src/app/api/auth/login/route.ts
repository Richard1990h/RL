import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, createToken, setSessionCookie } from "@/lib/auth";
import { logAudit } from "@/lib/user-storage";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRequestIp, isAccountRestricted } from "@/lib/security-policy";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, rememberMe } = body;
    const normalizedEmail = typeof email === "string" ? email.toLowerCase().trim() : "";
    const ip = getRequestIp(req.headers.get("x-forwarded-for"), req.headers.get("x-real-ip"));

    if (!normalizedEmail || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (!checkRateLimit(`auth_login_ip:${ip}`, 25, 10 * 60_000)) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }
    if (!checkRateLimit(`auth_login_email:${normalizedEmail}`, 10, 10 * 60_000)) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        wallet: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      try {
        await logAudit(user.email, "login_attempts", {
          emailUsed: normalizedEmail,
          ip,
        });
      } catch {} // Non-fatal
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    if (isAccountRestricted(user)) {
      return NextResponse.json({ error: "Account is disabled" }, { status: 403 });
    }

    // Create JWT token
    const token = createToken({ userId: user.id, email: user.email });

    // Set session cookie (30 days if rememberMe, else session-only)
    await setSessionCookie(token, rememberMe ? 30 * 24 * 60 * 60 : undefined);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        isCreator: user.isCreator,
        verifiedBadge: user.verifiedBadge,
        followerCount: user.followerCount,
        followingCount: user.followingCount,
        isPremium: user.isPremium,
        isOwner: user.isOwner,
        isBanned: user.isBanned,
        role: user.role,
        createdAt: user.createdAt,
        wallet: user.wallet
          ? {
              credits: user.wallet.credits,
              totalEarned: user.wallet.totalEarned,
              totalSpent: user.wallet.totalSpent,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
