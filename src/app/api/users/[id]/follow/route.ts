import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetUserId } = await params;
    const currentUser = await requireAuth();

    if (currentUser.id === targetUserId) {
      return NextResponse.json(
        { error: "You cannot follow yourself" },
        { status: 400 }
      );
    }

    // Check target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Check if already following
    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUser.id,
          followingId: targetUserId,
        },
      },
    });

    if (existingFollow) {
      return NextResponse.json(
        { error: "You are already following this user" },
        { status: 409 }
      );
    }

    // Check if blocked
    const blocked = await prisma.block.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: targetUserId,
          blockedId: currentUser.id,
        },
      },
    });

    if (blocked) {
      return NextResponse.json(
        { error: "You cannot follow this user" },
        { status: 403 }
      );
    }

    // Create follow and update counts in a transaction
    await prisma.$transaction([
      prisma.follow.create({
        data: {
          followerId: currentUser.id,
          followingId: targetUserId,
        },
      }),
      prisma.user.update({
        where: { id: currentUser.id },
        data: { followingCount: { increment: 1 } },
      }),
      prisma.user.update({
        where: { id: targetUserId },
        data: { followerCount: { increment: 1 } },
      }),
    ]);

    // Notify the target user about the new follower
    await prisma.notification.create({
      data: {
        userId: targetUserId,
        type: "FOLLOW",
        message: `${currentUser.displayName || currentUser.username} started following you`,
        relatedId: currentUser.id,
      },
    });

    return NextResponse.json(
      { message: "Successfully followed user" },
      { status: 201 }
    );
  } catch (error: any) {
    if (error?.status === 401) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Follow error:", error);
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
    const { id: targetUserId } = await params;
    const currentUser = await requireAuth();

    if (currentUser.id === targetUserId) {
      return NextResponse.json(
        { error: "You cannot unfollow yourself" },
        { status: 400 }
      );
    }

    // Check if following
    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUser.id,
          followingId: targetUserId,
        },
      },
    });

    if (!existingFollow) {
      return NextResponse.json(
        { error: "You are not following this user" },
        { status: 404 }
      );
    }

    // Remove follow and update counts in a transaction
    await prisma.$transaction([
      prisma.follow.delete({
        where: {
          followerId_followingId: {
            followerId: currentUser.id,
            followingId: targetUserId,
          },
        },
      }),
      prisma.user.update({
        where: { id: currentUser.id },
        data: { followingCount: { decrement: 1 } },
      }),
      prisma.user.update({
        where: { id: targetUserId },
        data: { followerCount: { decrement: 1 } },
      }),
    ]);

    return NextResponse.json({ message: "Successfully unfollowed user" });
  } catch (error: any) {
    if (error?.status === 401) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Unfollow error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
