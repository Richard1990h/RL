import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createToken, setSessionCookie } from "@/lib/auth";
import { randomBytes } from "crypto";
import { createUserFolders, logAudit } from "@/lib/user-storage";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  // Use public URL for redirects (req.url resolves to localhost behind Cloudflare Tunnel)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.url;

  if (error || !code) {
    return NextResponse.redirect(new URL("/login?error=google_denied", baseUrl));
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      console.error("Google token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(new URL("/login?error=google_token_failed", baseUrl));
    }

    const tokens = await tokenRes.json();

    // Get user info from Google
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoRes.ok) {
      console.error("Google userinfo failed:", await userInfoRes.text());
      return NextResponse.redirect(new URL("/login?error=google_userinfo_failed", baseUrl));
    }

    const googleUser = await userInfoRes.json();
    // googleUser has: { id, email, name, picture, verified_email }

    if (!googleUser.email) {
      return NextResponse.redirect(new URL("/login?error=google_no_email", baseUrl));
    }

    const email = googleUser.email.toLowerCase();

    // Check if user already exists with this email
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Create new user from Google profile
      // Generate a unique username from Google name
      const baseUsername = (googleUser.name || "user")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 20);

      // Ensure username is unique
      let username = baseUsername;
      let suffix = 1;
      while (await prisma.user.findUnique({ where: { username } })) {
        username = `${baseUsername.slice(0, 17)}${suffix}`;
        suffix++;
      }

      // Ensure displayName is unique (schema has unique constraint)
      let displayName = googleUser.name || username;
      let dnSuffix = 1;
      while (await prisma.user.findUnique({ where: { displayName } })) {
        displayName = `${(googleUser.name || username).slice(0, 47)} ${dnSuffix}`;
        dnSuffix++;
      }

      // Generate a random password hash (user won't use it - they sign in via Google)
      const randomPassword = randomBytes(32).toString("hex");
      const bcrypt = await import("bcryptjs");
      const passwordHash = await bcrypt.hash(randomPassword, 12);

      user = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email,
            username,
            displayName,
            passwordHash,
            avatarUrl: googleUser.picture || null,
            dateOfBirth: new Date("2000-01-01"), // Default, user can update in settings
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

      // Create email-based storage folders and initialize audit files
      try {
        await createUserFolders(email);
        await logAudit(email, "emails", { initial: email });
        await logAudit(email, "usernames", { initial: username });
        await logAudit(email, "displaynames", { initial: displayName });
      } catch (fsErr) {
        console.error(`Failed to create storage folders for ${email}:`, fsErr);
      }
    } else {
      // Existing user - optionally update their avatar if they don't have one
      if (!user.avatarUrl && googleUser.picture) {
        await prisma.user.update({
          where: { id: user.id },
          data: { avatarUrl: googleUser.picture },
        });
      }
    }

    // Create JWT and set session cookie
    const token = createToken({ userId: user.id, email: user.email });
    await setSessionCookie(token);

    // Redirect to home
    return NextResponse.redirect(new URL("/home", baseUrl));
  } catch (err) {
    console.error("Google OAuth error:", err);
    return NextResponse.redirect(new URL("/login?error=google_server_error", baseUrl));
  }
}
