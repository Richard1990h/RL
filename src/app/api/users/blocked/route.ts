import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET: List all users blocked by the current user
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const blocks = await prisma.block.findMany({
      where: { blockerId: user.id },
      include: {
        blocked: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const blockedUsers = blocks.map((b) => ({
      id: b.blocked.id,
      username: b.blocked.username,
      displayName: b.blocked.displayName,
      avatarUrl: b.blocked.avatarUrl,
      blockedAt: b.createdAt,
    }));

    return NextResponse.json({ blockedUsers });
  } catch (error) {
    console.error("GET /api/users/blocked error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
