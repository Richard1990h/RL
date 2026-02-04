import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q");
    const type = searchParams.get("type") || "all";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));

    if (!q || q.trim().length === 0) {
      return NextResponse.json(
        { error: "Search query is required" },
        { status: 400 }
      );
    }

    const skip = (page - 1) * limit;
    const query = q.trim();

    let videos: any[] = [];
    let users: any[] = [];
    let videoTotal = 0;
    let userTotal = 0;

    // Search videos
    if (type === "all" || type === "videos") {
      const videoWhere = {
        status: "READY" as const,
        visibility: "PUBLIC" as const,
        OR: [
          { title: { contains: query } },
          { description: { contains: query } },
        ],
      };

      [videos, videoTotal] = await Promise.all([
        prisma.video.findMany({
          where: videoWhere,
          orderBy: { uploadDate: "desc" },
          skip: type === "videos" ? skip : 0,
          take: type === "videos" ? limit : Math.min(limit, 10),
          include: {
            creator: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
                verifiedBadge: true,
              },
            },
          },
        }),
        prisma.video.count({ where: videoWhere }),
      ]);
    }

    // Search users
    if (type === "all" || type === "users") {
      const userWhere = {
        OR: [
          { username: { contains: query } },
          { displayName: { contains: query } },
        ],
      };

      [users, userTotal] = await Promise.all([
        prisma.user.findMany({
          where: userWhere,
          orderBy: { followerCount: "desc" },
          skip: type === "users" ? skip : 0,
          take: type === "users" ? limit : Math.min(limit, 10),
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            bio: true,
            isCreator: true,
            verifiedBadge: true,
            followerCount: true,
          },
        }),
        prisma.user.count({ where: userWhere }),
      ]);
    }

    return NextResponse.json({
      query,
      videos: type !== "users" ? videos : undefined,
      users: type !== "videos" ? users : undefined,
      pagination: {
        page,
        limit,
        videoTotal: type !== "users" ? videoTotal : undefined,
        userTotal: type !== "videos" ? userTotal : undefined,
      },
    });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
