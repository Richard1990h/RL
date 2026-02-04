import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, requireAuth } from "@/lib/auth";
import { Prisma } from "@/generated/prisma";
import { processVideo } from "@/lib/video-processing";

/** Ensure tags is always an array (handles double-stringified JSON values) */
function normalizeTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags;
  if (typeof tags === "string") {
    try { const parsed = JSON.parse(tags); if (Array.isArray(parsed)) return parsed; } catch {}
    return tags ? [tags] : [];
  }
  return [];
}

function normalizeVideoTags<T extends { tags: unknown }>(video: T): T & { tags: string[] } {
  return { ...video, tags: normalizeTags(video.tags) };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const sort = searchParams.get("sort") || "recent";
    const creatorId = searchParams.get("creatorId");
    const likedBy = searchParams.get("likedBy");
    const tag = searchParams.get("tag");
    const search = searchParams.get("search");

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.VideoWhereInput = {
      status: "READY",
      visibility: "PUBLIC",
    };

    if (creatorId) {
      where.creatorId = creatorId;
    }

    if (likedBy) {
      where.likesList = { some: { userId: likedBy, isLike: true } };
    }

    if (tag) {
      const sanitizedTag = tag.slice(0, 100);
      where.tags = { array_contains: sanitizedTag };
    }

    if (search) {
      const sanitizedSearch = search.slice(0, 200);
      where.OR = [
        { title: { contains: sanitizedSearch } },
        { description: { contains: sanitizedSearch } },
      ];
    }

    // Check if current user is authenticated for personalized results
    const currentUser = await getCurrentUser();

    // If viewing own videos or creator-specific, show all visibilities
    if (currentUser && creatorId === currentUser.id) {
      delete where.visibility;
      delete where.status;
    }

    // Build orderBy
    let orderBy: Prisma.VideoOrderByWithRelationInput;
    switch (sort) {
      case "popular":
        orderBy = { views: "desc" };
        break;
      case "trending":
        orderBy = { likes: "desc" };
        break;
      case "recent":
      default:
        orderBy = { uploadDate: "desc" };
        break;
    }

    // For the default feed (sort=recent, no specific creator/tag/search filters),
    // diversify by interleaving creators in round-robin so no single creator
    // dominates the feed.
    const isDiversifiedFeed =
      sort === "recent" && !creatorId && !tag && !search && !likedBy;

    if (isDiversifiedFeed) {
      // Fetch all matching videos (up to a reasonable cap)
      const [allVideos, total] = await Promise.all([
        prisma.video.findMany({
          where,
          orderBy,
          take: 200,
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
        prisma.video.count({ where }),
      ]);

      // Group by creator
      const buckets = new Map<string, typeof allVideos>();
      for (const v of allVideos) {
        const cid = v.creatorId;
        if (!buckets.has(cid)) buckets.set(cid, []);
        buckets.get(cid)!.push(v);
      }

      // Shuffle each creator's bucket so feed varies per page load
      for (const bucket of buckets.values()) {
        for (let i = bucket.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [bucket[i], bucket[j]] = [bucket[j], bucket[i]];
        }
      }

      // Round-robin interleave across creators
      const interleaved: typeof allVideos = [];
      const creatorIds = Array.from(buckets.keys());
      // Shuffle creator order too for fairness
      for (let i = creatorIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [creatorIds[i], creatorIds[j]] = [creatorIds[j], creatorIds[i]];
      }
      const pointers = new Map<string, number>();
      for (const cid of creatorIds) pointers.set(cid, 0);

      let remaining = true;
      while (remaining) {
        remaining = false;
        for (const cid of creatorIds) {
          const bucket = buckets.get(cid)!;
          const ptr = pointers.get(cid)!;
          if (ptr < bucket.length) {
            interleaved.push(bucket[ptr]);
            pointers.set(cid, ptr + 1);
            remaining = true;
          }
        }
      }

      // Apply pagination to the interleaved result
      const paginatedVideos = interleaved.slice(skip, skip + limit);

      return NextResponse.json({
        videos: paginatedVideos.map(normalizeVideoTags),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    }

    const [videos, total] = await Promise.all([
      prisma.video.findMany({
        where,
        orderBy,
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
        },
      }),
      prisma.video.count({ where }),
    ]);

    return NextResponse.json({
      videos: videos.map(normalizeVideoTags),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("List videos error:", error);
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
        { error: "Only creators can upload videos" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      title,
      description,
      thumbnailUrl,
      videoUrl,
      durationSec,
      tags,
      visibility,
      seriesId,
      seriesOrder,
    } = body;

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

    // Validate series if provided
    if (seriesId) {
      const series = await prisma.series.findUnique({
        where: { id: seriesId },
      });
      if (!series || series.creatorId !== currentUser.id) {
        return NextResponse.json(
          { error: "Series not found or does not belong to you" },
          { status: 400 }
        );
      }
    }

    // Wrap video creation + series update in a transaction
    // Video starts as PROCESSING — ffmpeg will re-encode and mark READY
    const video = await prisma.$transaction(async (tx) => {
      const created = await tx.video.create({
        data: {
          title,
          description: description || "",
          thumbnailUrl: thumbnailUrl || null,
          videoUrl: videoUrl || null,
          durationSec: durationSec || 0,
          creatorId: currentUser.id,
          tags: tags || [],
          visibility: (visibility || "PUBLIC").toUpperCase(),
          seriesId: seriesId || null,
          seriesOrder: seriesOrder || null,
          status: "PROCESSING",
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

      // If added to a series, update episode count atomically
      if (seriesId) {
        await tx.series.update({
          where: { id: seriesId },
          data: { totalEpisodes: { increment: 1 } },
        });
      }

      return created;
    });

    // Kick off video processing in the background (don't await)
    // ffmpeg will re-encode to H.264 MP4 with fast-start and update status to READY
    if (videoUrl) {
      const rawPath = videoUrl.startsWith("/") ? videoUrl.slice(1) : videoUrl;
      processVideo(video.id, rawPath).catch((err) => {
        console.error(`Background processing failed for video ${video.id}:`, err);
      });
    }

    return NextResponse.json({ video }, { status: 201 });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Create video error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
