import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: senderUserId } = await params;
    const currentUser = await requireAuth();
    const { action } = await req.json();

    if (!action || !["accept", "decline"].includes(action)) {
      return NextResponse.json({ error: "Invalid action. Must be 'accept' or 'decline'" }, { status: 400 });
    }

    // Find the pending request from senderUserId to currentUser
    const request = await prisma.friendRequest.findUnique({
      where: {
        senderId_receiverId: { senderId: senderUserId, receiverId: currentUser.id },
      },
    });

    if (!request || request.status !== "PENDING") {
      return NextResponse.json({ error: "No pending friend request found" }, { status: 404 });
    }

    if (action === "decline") {
      await prisma.friendRequest.update({
        where: { id: request.id },
        data: { status: "DECLINED" },
      });
      return NextResponse.json({ message: "Friend request declined" });
    }

    // Accept: create friendship, update request, increment counts
    const [u1, u2] = [currentUser.id, senderUserId].sort();

    await prisma.$transaction(async (tx) => {
      await tx.friendRequest.update({
        where: { id: request.id },
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
        where: { id: senderUserId },
        data: { friendCount: { increment: 1 } },
      });

      // Check for timeout before creating notification
      const timeout = await tx.friendTimeout.findUnique({
        where: { ownerId_targetId: { ownerId: senderUserId, targetId: currentUser.id } },
      });
      const isTimedOut = timeout && timeout.expiresAt > new Date();

      if (!isTimedOut) {
        await tx.notification.create({
          data: {
            userId: senderUserId,
            type: "FRIEND_ACCEPT",
            message: `${currentUser.displayName} accepted your friend request`,
            relatedId: currentUser.id,
          },
        });
      }
    });

    return NextResponse.json({ message: "Friend request accepted" }, { status: 201 });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Respond to friend request error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
