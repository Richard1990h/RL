import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET: Get messages between current user and conversationUserId
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ conversationUserId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversationUserId } = await params;

    // Check if either user has blocked the other
    const block = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: user.id, blockedId: conversationUserId },
          { blockerId: conversationUserId, blockedId: user.id },
        ],
      },
    });
    if (block) {
      return NextResponse.json({ error: "Cannot send messages to this user" }, { status: 403 });
    }

    // Fetch messages between the two users
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          {
            senderId: user.id,
            receiverId: conversationUserId,
            status: { not: "DELETED" },
          },
          {
            senderId: conversationUserId,
            receiverId: user.id,
            deletedForRecipientAt: null,
            status: { not: "DELETED" },
          },
        ],
      },
      include: {
        sender: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
        receiver: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Mark undelivered messages from the other user as DELIVERED
    await prisma.message.updateMany({
      where: {
        senderId: conversationUserId,
        receiverId: user.id,
        status: "SENT",
      },
      data: { status: "DELIVERED" },
    });

    // Get streak info
    const [u1, u2] = [user.id, conversationUserId].sort();
    const streak = await prisma.messageStreak.findUnique({
      where: { user1Id_user2Id: { user1Id: u1, user2Id: u2 } },
    });

    return NextResponse.json({
      messages,
      streak: streak
        ? {
            streakDays: streak.streakDays,
            lastMessage: streak.lastMessage,
            bonusesPaid: streak.bonusesPaid,
          }
        : null,
    });
  } catch (error) {
    console.error("GET /api/messages/[conversationUserId] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE: Delete conversation (mark all as DELETED for current user)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ conversationUserId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversationUserId } = await params;

    // Mark sent messages as DELETED
    await prisma.message.updateMany({
      where: {
        senderId: user.id,
        receiverId: conversationUserId,
      },
      data: { status: "DELETED" },
    });

    // Mark received messages as deleted for recipient
    await prisma.message.updateMany({
      where: {
        senderId: conversationUserId,
        receiverId: user.id,
      },
      data: { deletedForRecipientAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/messages/[conversationUserId] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
