import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, requireAuth } from "@/lib/auth";

/** Ensure tags is always an array (handles double-stringified JSON values) */
function normalizeTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags;
  if (typeof tags === "string") {
    try { const parsed = JSON.parse(tags); if (Array.isArray(parsed)) return parsed; } catch {}
    return tags ? [tags] : [];
  }
  return [];
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Fetch video and current user in parallel
    const [video, currentUser] = await Promise.all([
      prisma.video.findUnique({
        where: { id },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              verifiedBadge: true,
              followerCount: true,
            },
          },
          series: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      }),
      getCurrentUser(),
    ]);

    if (!video) {
      return NextResponse.json(
        { error: "Video not found" },
        { status: 404 }
      );
    }

    // Check visibility
    if (video.status === "DELETED") {
      return NextResponse.json(
        { error: "Video not found" },
        { status: 404 }
      );
    }

    // PROCESSING or FAILED videos are only visible to the creator
    if ((video.status === "PROCESSING" || video.status === "FAILED") && video.creatorId !== currentUser?.id) {
      return NextResponse.json(
        { error: "This video is still processing" },
        { status: 404 }
      );
    }

    if (video.visibility === "PRIVATE" && video.creatorId !== currentUser?.id) {
      return NextResponse.json(
        { error: "This video is private" },
        { status: 403 }
      );
    }

    if (video.visibility === "FOLLOWERS_ONLY" && video.creatorId !== currentUser?.id) {
      if (!currentUser) {
        return NextResponse.json(
          { error: "This video is for followers only" },
          { status: 403 }
        );
      }
      const isFollowing = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: currentUser.id,
            followingId: video.creatorId,
          },
        },
      });
      if (!isFollowing) {
        return NextResponse.json(
          { error: "This video is for followers only" },
          { status: 403 }
        );
      }
    }

    // Increment views and check like status in parallel (non-blocking)
    const likePromise = currentUser
      ? prisma.like.findUnique({
          where: { userId_videoId: { userId: currentUser.id, videoId: id } },
        })
      : Promise.resolve(null);

    // Fire view increment without awaiting — it's not needed for the response
    prisma.video.update({
      where: { id },
      data: { views: { increment: 1 } },
    }).catch(() => {});

    const like = await likePromise;
    const userLike = like ? (like.isLike ? "like" : "dislike") : null;

    return NextResponse.json({
      video: {
        ...video,
        tags: normalizeTags(video.tags),
        views: video.views + 1,
        userLike,
      },
    });
  } catch (error) {
    console.error("Get video error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const currentUser = await requireAuth();

    const video = await prisma.video.findUnique({
      where: { id },
    });

    if (!video) {
      return NextResponse.json(
        { error: "Video not found" },
        { status: 404 }
      );
    }

    if (video.creatorId !== currentUser.id) {
      return NextResponse.json(
        { error: "You can only update your own videos" },
        { status: 403 }
      );
    }

    if (video.status === "DELETED") {
      return NextResponse.json(
        { error: "Cannot update a deleted video" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { title, description, tags, visibility, commentsEnabled, thumbnailUrl } = body;

    const updateData: Record<string, unknown> = {};

    if (title !== undefined) {
      if (!title || title.length > 200) {
        return NextResponse.json(
          { error: "Title must be between 1 and 200 characters" },
          { status: 400 }
        );
      }
      updateData.title = title;
    }
    if (description !== undefined) updateData.description = description;
    if (tags !== undefined) updateData.tags = tags;
    if (visibility !== undefined) {
      const validVisibilities = ["PUBLIC", "UNLISTED", "PRIVATE", "FOLLOWERS_ONLY"];
      if (!validVisibilities.includes(visibility)) {
        return NextResponse.json(
          { error: "Invalid visibility value" },
          { status: 400 }
        );
      }
      updateData.visibility = visibility;
    }
    if (commentsEnabled !== undefined) updateData.commentsEnabled = commentsEnabled;
    if (thumbnailUrl !== undefined) updateData.thumbnailUrl = thumbnailUrl;
    if (body.seriesOrder !== undefined) updateData.seriesOrder = typeof body.seriesOrder === "number" ? body.seriesOrder : null;

    const updatedVideo = await prisma.video.update({
      where: { id },
      data: updateData,
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

    return NextResponse.json({ video: updatedVideo });
  } catch (error: any) {
    if (error?.status === 401) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Update video error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const currentUser = await requireAuth();

    const video = await prisma.video.findUnique({
      where: { id },
    });

    if (!video) {
      return NextResponse.json(
        { error: "Video not found" },
        { status: 404 }
      );
    }

    if (video.creatorId !== currentUser.id) {
      return NextResponse.json(
        { error: "You can only delete your own videos" },
        { status: 403 }
      );
    }

    // Soft delete
    await prisma.video.update({
      where: { id },
      data: { status: "DELETED" },
    });

    // Update series episode count if applicable
    if (video.seriesId) {
      await prisma.series.update({
        where: { id: video.seriesId },
        data: { totalEpisodes: { decrement: 1 } },
      });
    }

    return NextResponse.json({ message: "Video deleted successfully" });
  } catch (error: any) {
    if (error?.status === 401) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Delete video error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
