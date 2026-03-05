import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, createToken, setSessionCookie } from "@/lib/auth";
import { createUserFolders, logAudit } from "@/lib/user-storage";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/security-policy";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, username, displayName, password, dateOfBirth } = body;
    const normalizedEmail = typeof email === "string" ? email.toLowerCase().trim() : "";
    const normalizedUsername = typeof username === "string" ? username.toLowerCase().trim() : "";
    const ip = getRequestIp(req.headers.get("x-forwarded-for"), req.headers.get("x-real-ip"));

    // Validate required fields
    if (!email || !username || !displayName || !password || !dateOfBirth) {
      return NextResponse.json(
        { error: "All fields are required: email, username, displayName, password, dateOfBirth" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Validate username (alphanumeric + underscores, 3-30 chars)
    const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
    if (!usernameRegex.test(normalizedUsername)) {
      return NextResponse.json(
        { error: "Username must be 3-30 characters and contain only letters, numbers, and underscores" },
        { status: 400 }
      );
    }

    if (!checkRateLimit(`auth_register_ip:${ip}`, 10, 60 * 60_000)) {
      return NextResponse.json({ error: "Too many registrations from this IP" }, { status: 429 });
    }
    if (!checkRateLimit(`auth_register_email:${normalizedEmail}`, 5, 60 * 60_000)) {
      return NextResponse.json({ error: "Too many registration attempts for this email" }, { status: 429 });
    }

    // Validate password length
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Age gate: must be 13+
    const dob = new Date(dateOfBirth);
    if (isNaN(dob.getTime())) {
      return NextResponse.json(
        { error: "Invalid date of birth" },
        { status: 400 }
      );
    }

    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }

    if (age < 13) {
      return NextResponse.json(
        { error: "You must be at least 13 years old to register" },
        { status: 403 }
      );
    }

    // Check email uniqueness
    const existingEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingEmail) {
      return NextResponse.json(
        { error: "Email is already registered" },
        { status: 409 }
      );
    }

    // Check username uniqueness
    const existingUsername = await prisma.user.findUnique({ where: { username: normalizedUsername } });
    if (existingUsername) {
      return NextResponse.json(
        { error: "Username is already taken" },
        { status: 409 }
      );
    }

    // Check displayName uniqueness (MySQL default collation is case-insensitive)
    const existingDisplayName = await prisma.user.findFirst({
      where: { displayName: displayName },
    });
    if (existingDisplayName) {
      return NextResponse.json(
        { error: "Display name is already taken" },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user + wallet in a transaction
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          username: normalizedUsername,
          displayName,
          passwordHash,
          dateOfBirth: dob,
        },
      });

      await tx.wallet.create({
        data: {
          userId: newUser.id,
          credits: 0,
        },
      });

      return newUser;
    });

    // Create user storage folders on disk (keyed by email)
    try {
      await createUserFolders(user.email);
      await logAudit(user.email, "emails", { initial: user.email });
      await logAudit(user.email, "usernames", { initial: user.username });
      await logAudit(user.email, "displaynames", { initial: user.displayName });
      await logAudit(user.email, "age", { dateOfBirth: dob.toISOString(), age });
    } catch (fsErr) {
      // Non-fatal — log but don't block registration
      console.error(`Failed to create storage folders for ${user.email}:`, fsErr);
    }

    // Create JWT and set cookie
    const token = createToken({ userId: user.id, email: user.email });
    await setSessionCookie(token);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        isCreator: user.isCreator,
        isOwner: user.isOwner,
        isBanned: user.isBanned,
        createdAt: user.createdAt,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
