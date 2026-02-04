import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const currentUser = await requireAuth();
    const { searchParams } = new URL(req.url);
    const direction = searchParams.get("direction") || "incoming";

    if (direction === "incoming") {
      const requests = await prisma.friendRequest.findMany({
        where: {
          receiverId: currentUser.id,
          status: "PENDING",
        },
        include: {
          sender: {
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

      return NextResponse.json({
        requests: requests.map((r) => ({
          id: r.id,
          user: r.sender,
          status: r.status,
          createdAt: r.createdAt,
        })),
      });
    }

    // Outgoing
    const requests = await prisma.friendRequest.findMany({
      where: {
        senderId: currentUser.id,
        status: "PENDING",
      },
      include: {
        receiver: {
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

    return NextResponse.json({
      requests: requests.map((r) => ({
        id: r.id,
        user: r.receiver,
        status: r.status,
        createdAt: r.createdAt,
      })),
    });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Friend requests error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
