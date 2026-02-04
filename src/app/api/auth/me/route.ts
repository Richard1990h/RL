import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
      include: {
        wallet: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

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
        isDeactivated: user.isDeactivated,
        role: user.role,
        preferences: user.preferences,
        premiumUntil: user.premiumUntil,
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
    console.error("Get current user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
