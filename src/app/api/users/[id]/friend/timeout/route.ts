import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// Set a friend timeout (mute notifications)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetUserId } = await params;
    const currentUser = await requireAuth();

    if (currentUser.id === targetUserId) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { duration } = await req.json();
    if (!duration || typeof duration !== "number" || duration < 1) {
      return NextResponse.json({ error: "Invalid duration in minutes" }, { status: 400 });
    }

    // Verify friendship exists
    const [u1, u2] = [currentUser.id, targetUserId].sort();
    const friendship = await prisma.friendship.findUnique({
      where: { user1Id_user2Id: { user1Id: u1, user2Id: u2 } },
    });
    if (!friendship) {
      return NextResponse.json({ error: "You are not friends with this user" }, { status: 404 });
    }

    const expiresAt = new Date(Date.now() + duration * 60 * 1000);

    await prisma.friendTimeout.upsert({
      where: {
        ownerId_targetId: { ownerId: currentUser.id, targetId: targetUserId },
      },
      create: {
        ownerId: currentUser.id,
        targetId: targetUserId,
        expiresAt,
      },
      update: {
        expiresAt,
      },
    });

    return NextResponse.json({ message: "Friend timeout set", expiresAt }, { status: 201 });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Friend timeout error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Remove a friend timeout
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetUserId } = await params;
    const currentUser = await requireAuth();

    const timeout = await prisma.friendTimeout.findUnique({
      where: {
        ownerId_targetId: { ownerId: currentUser.id, targetId: targetUserId },
      },
    });

    if (!timeout) {
      return NextResponse.json({ error: "No timeout found" }, { status: 404 });
    }

    await prisma.friendTimeout.delete({
      where: { id: timeout.id },
    });

    return NextResponse.json({ message: "Friend timeout removed" });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Remove friend timeout error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
