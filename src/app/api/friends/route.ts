import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const currentUser = await requireAuth();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const offset = (page - 1) * limit;

    const ONLINE_THRESHOLD = new Date(Date.now() - 3 * 60 * 1000);

    // Get all friendships where this user is involved
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { user1Id: currentUser.id },
          { user2Id: currentUser.id },
        ],
      },
      include: {
        user1: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            lastActiveAt: true,
          },
        },
        user2: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            lastActiveAt: true,
          },
        },
      },
    });

    // Map to friend objects
    let friends = friendships.map((f) => {
      const friend = f.user1Id === currentUser.id ? f.user2 : f.user1;
      const isOnline = friend.lastActiveAt ? friend.lastActiveAt > ONLINE_THRESHOLD : false;
      return {
        id: friend.id,
        username: friend.username,
        displayName: friend.displayName,
        avatarUrl: friend.avatarUrl,
        isOnline,
        lastActiveAt: friend.lastActiveAt,
        friendshipId: f.id,
        friendsSince: f.createdAt,
      };
    });

    // Apply search filter
    if (search) {
      const q = search.toLowerCase();
      friends = friends.filter(
        (f) =>
          f.displayName.toLowerCase().includes(q) ||
          f.username.toLowerCase().includes(q)
      );
    }

    // Sort: online first, then alphabetical
    friends.sort((a, b) => {
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      return a.displayName.localeCompare(b.displayName);
    });

    const total = friends.length;
    const paginated = friends.slice(offset, offset + limit);

    return NextResponse.json({
      friends: paginated,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Friends list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
