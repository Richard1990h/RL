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
        { error: "You cannot block yourself" },
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

    // Check if already blocked
    const existingBlock = await prisma.block.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: currentUser.id,
          blockedId: targetUserId,
        },
      },
    });

    if (existingBlock) {
      return NextResponse.json(
        { error: "User is already blocked" },
        { status: 409 }
      );
    }

    // Block user and also unfollow in both directions within a transaction
    await prisma.$transaction(async (tx) => {
      // Create the block
      await tx.block.create({
        data: {
          blockerId: currentUser.id,
          blockedId: targetUserId,
        },
      });

      // Remove follow: current user -> target (if exists)
      const followToTarget = await tx.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: currentUser.id,
            followingId: targetUserId,
          },
        },
      });

      if (followToTarget) {
        await tx.follow.delete({
          where: { id: followToTarget.id },
        });
        await tx.user.update({
          where: { id: currentUser.id },
          data: { followingCount: { decrement: 1 } },
        });
        await tx.user.update({
          where: { id: targetUserId },
          data: { followerCount: { decrement: 1 } },
        });
      }

      // Remove follow: target -> current user (if exists)
      const followFromTarget = await tx.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: targetUserId,
            followingId: currentUser.id,
          },
        },
      });

      if (followFromTarget) {
        await tx.follow.delete({
          where: { id: followFromTarget.id },
        });
        await tx.user.update({
          where: { id: targetUserId },
          data: { followingCount: { decrement: 1 } },
        });
        await tx.user.update({
          where: { id: currentUser.id },
          data: { followerCount: { decrement: 1 } },
        });
      }

      // Remove friendship (if exists)
      const [u1, u2] = [currentUser.id, targetUserId].sort();
      const friendship = await tx.friendship.findUnique({
        where: { user1Id_user2Id: { user1Id: u1, user2Id: u2 } },
      });
      if (friendship) {
        await tx.friendship.delete({ where: { id: friendship.id } });
        await tx.user.update({
          where: { id: currentUser.id },
          data: { friendCount: { decrement: 1 } },
        });
        await tx.user.update({
          where: { id: targetUserId },
          data: { friendCount: { decrement: 1 } },
        });
      }

      // Remove any friend requests in both directions
      await tx.friendRequest.deleteMany({
        where: {
          OR: [
            { senderId: currentUser.id, receiverId: targetUserId },
            { senderId: targetUserId, receiverId: currentUser.id },
          ],
        },
      });

      // Remove friend timeouts in both directions
      await tx.friendTimeout.deleteMany({
        where: {
          OR: [
            { ownerId: currentUser.id, targetId: targetUserId },
            { ownerId: targetUserId, targetId: currentUser.id },
          ],
        },
      });
    });

    return NextResponse.json(
      { message: "User blocked successfully" },
      { status: 201 }
    );
  } catch (error: any) {
    if (error?.status === 401) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Block error:", error);
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
        { error: "You cannot unblock yourself" },
        { status: 400 }
      );
    }

    // Check if block exists
    const existingBlock = await prisma.block.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: currentUser.id,
          blockedId: targetUserId,
        },
      },
    });

    if (!existingBlock) {
      return NextResponse.json(
        { error: "User is not blocked" },
        { status: 404 }
      );
    }

    await prisma.block.delete({
      where: {
        blockerId_blockedId: {
          blockerId: currentUser.id,
          blockedId: targetUserId,
        },
      },
    });

    return NextResponse.json({ message: "User unblocked successfully" });
  } catch (error: any) {
    if (error?.status === 401) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Unblock error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
