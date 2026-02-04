import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, requireAuth, verifyPassword, clearSessionCookie } from "@/lib/auth";
import { renameUserFolder, logAudit } from "@/lib/user-storage";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        isCreator: true,
        verifiedBadge: true,
        followerCount: true,
        followingCount: true,
        isPremium: true,
        createdAt: true,
        _count: {
          select: {
            videos: {
              where: {
                status: "READY",
                visibility: "PUBLIC",
              },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Check if current user is following this user
    let isFollowing = false;
    let isBlocked = false;
    const currentUser = await getCurrentUser();
    if (currentUser && currentUser.id !== id) {
      const follow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: currentUser.id,
            followingId: id,
          },
        },
      });
      isFollowing = !!follow;

      const block = await prisma.block.findUnique({
        where: {
          blockerId_blockedId: {
            blockerId: currentUser.id,
            blockedId: id,
          },
        },
      });
      isBlocked = !!block;
    }

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        isCreator: user.isCreator,
        verifiedBadge: user.verifiedBadge,
        followerCount: user.followerCount,
        followingCount: user.followingCount,
        isPremium: user.isPremium,
        createdAt: user.createdAt,
        videoCount: user._count.videos,
        isFollowing,
        isBlocked,
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const currentUser = await requireAuth();

    if (currentUser.id !== id) {
      return NextResponse.json(
        { error: "You can only update your own profile" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { displayName, bio, avatarUrl, email, username, currentPassword, preferences, isDeactivated } = body;

    const updateData: Record<string, unknown> = {};

    // Determine if sensitive fields are being changed
    const isChangingEmail = email !== undefined && email.toLowerCase() !== currentUser.email;
    const isChangingUsername = username !== undefined && username.toLowerCase() !== currentUser.username;

    // If email or username is being changed, require currentPassword
    if (isChangingEmail || isChangingUsername) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Current password is required to change email or username" },
          { status: 400 }
        );
      }

      const passwordValid = await verifyPassword(currentPassword, currentUser.passwordHash);
      if (!passwordValid) {
        return NextResponse.json(
          { error: "Incorrect password" },
          { status: 403 }
        );
      }
    }

    // Validate and set email
    if (isChangingEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { error: "Invalid email format" },
          { status: 400 }
        );
      }

      const existingEmail = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });
      if (existingEmail && existingEmail.id !== id) {
        return NextResponse.json(
          { error: "Email is already taken" },
          { status: 409 }
        );
      }
      updateData.email = email.toLowerCase();

      // Rename storage folder and log email change
      try {
        await renameUserFolder(currentUser.email, email.toLowerCase());
        await logAudit(email.toLowerCase(), "emails", {
          oldEmail: currentUser.email,
          newEmail: email.toLowerCase(),
        });
      } catch (err) {
        console.error("Failed to rename user folder:", err);
      }
    }

    // Validate and set username
    if (isChangingUsername) {
      const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
      if (!usernameRegex.test(username)) {
        return NextResponse.json(
          { error: "Username must be 3-30 characters and contain only letters, numbers, and underscores" },
          { status: 400 }
        );
      }

      const existingUsername = await prisma.user.findUnique({
        where: { username: username.toLowerCase() },
      });
      if (existingUsername && existingUsername.id !== id) {
        return NextResponse.json(
          { error: "Username is already taken" },
          { status: 409 }
        );
      }
      updateData.username = username.toLowerCase();

      try {
        await logAudit(currentUser.email, "usernames", {
          oldUsername: currentUser.username,
          newUsername: username.toLowerCase(),
        });
      } catch {} // Non-fatal
    }

    // Validate and set displayName
    if (displayName !== undefined) {
      if (!displayName || displayName.length > 50) {
        return NextResponse.json(
          { error: "Display name must be between 1 and 50 characters" },
          { status: 400 }
        );
      }

      // Check displayName uniqueness if it's actually changing
      if (displayName !== currentUser.displayName) {
        const existingDisplayName = await prisma.user.findFirst({
          where: { displayName: displayName },
        });
        if (existingDisplayName && existingDisplayName.id !== id) {
          return NextResponse.json(
            { error: "Display name is already taken" },
            { status: 409 }
          );
        }
      }
      updateData.displayName = displayName;

      if (displayName !== currentUser.displayName) {
        try {
          await logAudit(currentUser.email, "displaynames", {
            oldDisplayName: currentUser.displayName,
            newDisplayName: displayName,
          });
        } catch {} // Non-fatal
      }
    }

    if (bio !== undefined) {
      if (bio.length > 500) {
        return NextResponse.json(
          { error: "Bio must be 500 characters or less" },
          { status: 400 }
        );
      }
      updateData.bio = bio;
    }
    if (avatarUrl !== undefined) {
      updateData.avatarUrl = avatarUrl;
    }
    if (preferences !== undefined) {
      updateData.preferences = preferences;
    }
    if (isDeactivated !== undefined) {
      updateData.isDeactivated = !!isDeactivated;
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        isCreator: true,
        verifiedBadge: true,
        followerCount: true,
        followingCount: true,
        isPremium: true,
        isOwner: true,
        isBanned: true,
        isDeactivated: true,
        preferences: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error: any) {
    if (error?.status === 401 || error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Update user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const currentUser = await requireAuth();

    if (currentUser.id !== id) {
      return NextResponse.json(
        { error: "You can only delete your own account" },
        { status: 403 }
      );
    }

    // Delete user and all cascaded data
    await prisma.user.delete({
      where: { id },
    });

    // Clear session cookie
    await clearSessionCookie();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Delete user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
