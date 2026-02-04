import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// POST: Mark a specific message as opened
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationUserId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversationUserId } = await params;
    const body = await request.json();
    const { messageId } = body;

    if (!messageId) {
      return NextResponse.json({ error: "messageId is required" }, { status: 400 });
    }

    // Find the message
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Verify this message belongs to this conversation and current user is the receiver
    if (message.receiverId !== user.id || message.senderId !== conversationUserId) {
      return NextResponse.json({ error: "Message does not belong to this conversation" }, { status: 403 });
    }

    // Set openedAt and status
    const updateData: { openedAt: Date; status: "OPENED"; deletedForRecipientAt?: Date } = {
      openedAt: new Date(),
      status: "OPENED" as const,
    };

    // If deleteAfter is IMMEDIATELY, mark as DELETED for both users
    if (message.deleteAfter === "IMMEDIATELY") {
      updateData.deletedForRecipientAt = new Date();
      (updateData as any).status = "DELETED";
    }

    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: updateData,
    });

    return NextResponse.json({ message: updatedMessage });
  } catch (error) {
    console.error("POST /api/messages/[conversationUserId]/open error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
