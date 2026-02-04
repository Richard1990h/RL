import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// Remove a friendship
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetUserId } = await params;
    const currentUser = await requireAuth();

    if (currentUser.id === targetUserId) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const [u1, u2] = [currentUser.id, targetUserId].sort();
    const friendship = await prisma.friendship.findUnique({
      where: { user1Id_user2Id: { user1Id: u1, user2Id: u2 } },
    });

    if (!friendship) {
      return NextResponse.json({ error: "You are not friends with this user" }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.friendship.delete({
        where: { id: friendship.id },
      }),
      prisma.user.update({
        where: { id: currentUser.id },
        data: { friendCount: { decrement: 1 } },
      }),
      prisma.user.update({
        where: { id: targetUserId },
        data: { friendCount: { decrement: 1 } },
      }),
    ]);

    return NextResponse.json({ message: "Friend removed successfully" });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Remove friend error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
