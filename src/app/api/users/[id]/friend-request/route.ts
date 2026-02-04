import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// Send a friend request (or auto-accept if they already sent one to us)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetUserId } = await params;
    const currentUser = await requireAuth();

    if (currentUser.id === targetUserId) {
      return NextResponse.json({ error: "You cannot send a friend request to yourself" }, { status: 400 });
    }

    // Check target exists
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check blocks in both directions
    const block = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: currentUser.id, blockedId: targetUserId },
          { blockerId: targetUserId, blockedId: currentUser.id },
        ],
      },
    });
    if (block) {
      return NextResponse.json({ error: "Cannot send friend request to this user" }, { status: 403 });
    }

    // Check if already friends
    const [u1, u2] = [currentUser.id, targetUserId].sort();
    const existingFriendship = await prisma.friendship.findUnique({
      where: { user1Id_user2Id: { user1Id: u1, user2Id: u2 } },
    });
    if (existingFriendship) {
      return NextResponse.json({ error: "You are already friends with this user" }, { status: 409 });
    }

    // Check if we already sent a pending request
    const existingOutgoing = await prisma.friendRequest.findUnique({
      where: {
        senderId_receiverId: { senderId: currentUser.id, receiverId: targetUserId },
      },
    });
    if (existingOutgoing && existingOutgoing.status === "PENDING") {
      return NextResponse.json({ error: "Friend request already sent" }, { status: 409 });
    }

    // Check if THEY already sent US a pending request → auto-accept
    const existingIncoming = await prisma.friendRequest.findUnique({
      where: {
        senderId_receiverId: { senderId: targetUserId, receiverId: currentUser.id },
      },
    });

    if (existingIncoming && existingIncoming.status === "PENDING") {
      // Auto-accept: create friendship, update request, increment counts
      await prisma.$transaction(async (tx) => {
        await tx.friendRequest.update({
          where: { id: existingIncoming.id },
          data: { status: "ACCEPTED" },
        });

        await tx.friendship.create({
          data: { user1Id: u1, user2Id: u2 },
        });

        await tx.user.update({
          where: { id: currentUser.id },
          data: { friendCount: { increment: 1 } },
        });
        await tx.user.update({
          where: { id: targetUserId },
          data: { friendCount: { increment: 1 } },
        });

        // Check for timeout before creating notification
        const timeout = await tx.friendTimeout.findUnique({
          where: { ownerId_targetId: { ownerId: targetUserId, targetId: currentUser.id } },
        });
        const isTimedOut = timeout && timeout.expiresAt > new Date();

        if (!isTimedOut) {
          await tx.notification.create({
            data: {
              userId: targetUserId,
              type: "FRIEND_ACCEPT",
              message: `${currentUser.displayName} accepted your friend request`,
              relatedId: currentUser.id,
            },
          });
        }
      });

      return NextResponse.json({ message: "Friend request auto-accepted", status: "accepted" }, { status: 201 });
    }

    // Create new request (upsert to handle previously declined/cancelled)
    await prisma.$transaction(async (tx) => {
      if (existingOutgoing) {
        await tx.friendRequest.update({
          where: { id: existingOutgoing.id },
          data: { status: "PENDING", updatedAt: new Date() },
        });
      } else {
        await tx.friendRequest.create({
          data: {
            senderId: currentUser.id,
            receiverId: targetUserId,
          },
        });
      }

      // Check for timeout before creating notification
      const timeout = await tx.friendTimeout.findUnique({
        where: { ownerId_targetId: { ownerId: targetUserId, targetId: currentUser.id } },
      });
      const isTimedOut = timeout && timeout.expiresAt > new Date();

      if (!isTimedOut) {
        await tx.notification.create({
          data: {
            userId: targetUserId,
            type: "FRIEND_REQUEST",
            message: `${currentUser.displayName} sent you a friend request`,
            relatedId: currentUser.id,
          },
        });
      }
    });

    return NextResponse.json({ message: "Friend request sent", status: "pending" }, { status: 201 });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Send friend request error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Cancel a friend request
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetUserId } = await params;
    const currentUser = await requireAuth();

    const request = await prisma.friendRequest.findUnique({
      where: {
        senderId_receiverId: { senderId: currentUser.id, receiverId: targetUserId },
      },
    });

    if (!request || request.status !== "PENDING") {
      return NextResponse.json({ error: "No pending friend request found" }, { status: 404 });
    }

    await prisma.friendRequest.update({
      where: { id: request.id },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json({ message: "Friend request cancelled" });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Cancel friend request error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
