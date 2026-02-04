import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const creatorId = searchParams.get("creatorId");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));

    const skip = (page - 1) * limit;

    const where = creatorId ? { creatorId } : {};

    const [seriesList, total] = await Promise.all([
      prisma.series.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
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
          episodes: {
            where: {
              status: "READY",
              visibility: "PUBLIC",
            },
            orderBy: [{ seriesOrder: "asc" }, { uploadDate: "asc" }],
            select: {
              id: true,
              seriesOrder: true,
            },
          },
          _count: {
            select: {
              episodes: {
                where: {
                  status: "READY",
                  visibility: "PUBLIC",
                },
              },
            },
          },
        },
      }),
      prisma.series.count({ where }),
    ]);

    return NextResponse.json({
      series: seriesList.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        coverUrl: s.coverUrl,
        creatorId: s.creatorId,
        totalEpisodes: s.totalEpisodes,
        publicEpisodeCount: s._count.episodes,
        episodes: s.episodes.map((ep, idx) => ({
          videoId: ep.id,
          order: ep.seriesOrder ?? idx + 1,
        })),
        creator: s.creator,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("List series error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireAuth();

    // Check if user is a creator
    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
    });

    if (!user?.isCreator) {
      return NextResponse.json(
        { error: "Only creators can create series" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { title, description, coverUrl } = body;

    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    if (title.length > 200) {
      return NextResponse.json(
        { error: "Title must be 200 characters or less" },
        { status: 400 }
      );
    }

    const series = await prisma.series.create({
      data: {
        title,
        description: description || "",
        coverUrl: coverUrl || null,
        creatorId: currentUser.id,
      },
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
    });

    return NextResponse.json({ series }, { status: 201 });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Create series error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
