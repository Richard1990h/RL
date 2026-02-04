import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: videoId } = await params;
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const parentId = searchParams.get("parentId") || null;

    const skip = (page - 1) * limit;

    // Check video exists
    const video = await prisma.video.findUnique({
      where: { id: videoId },
    });

    if (!video || video.status === "DELETED") {
      return NextResponse.json(
        { error: "Video not found" },
        { status: 404 }
      );
    }

    const where = {
      videoId,
      parentId: parentId || null,
    };

    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              verifiedBadge: true,
            },
          },
          _count: {
            select: {
              replies: true,
            },
          },
        },
      }),
      prisma.comment.count({ where }),
    ]);

    // Check which comments the current user has liked
    const currentUser = await getCurrentUser();
    let likedCommentIds = new Set<string>();
    if (currentUser) {
      const userLikes = await prisma.commentLike.findMany({
        where: { userId: currentUser.id, commentId: { in: comments.map((c) => c.id) } },
        select: { commentId: true },
      });
      likedCommentIds = new Set(userLikes.map((l) => l.commentId));
    }

    return NextResponse.json({
      comments: comments.map((c) => ({
        id: c.id,
        userId: c.userId,
        videoId: c.videoId,
        text: c.text,
        likes: c.likes,
        parentId: c.parentId,
        createdAt: c.createdAt,
        user: c.user,
        replyCount: c._count.replies,
        userLiked: likedCommentIds.has(c.id),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("List comments error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: videoId } = await params;
    const currentUser = await requireAuth();

    const body = await req.json();
    const { text, parentId } = body;

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: "Comment text is required" },
        { status: 400 }
      );
    }

    if (text.length > 2000) {
      return NextResponse.json(
        { error: "Comment must be 2000 characters or less" },
        { status: 400 }
      );
    }

    // Check video exists and comments are enabled
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, status: true, commentsEnabled: true, creatorId: true },
    });

    if (!video || video.status === "DELETED") {
      return NextResponse.json(
        { error: "Video not found" },
        { status: 404 }
      );
    }

    if (!video.commentsEnabled) {
      return NextResponse.json(
        { error: "Comments are disabled for this video" },
        { status: 403 }
      );
    }

    // If replying, check parent comment exists
    if (parentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentId },
      });

      if (!parentComment || parentComment.videoId !== videoId) {
        return NextResponse.json(
          { error: "Parent comment not found" },
          { status: 404 }
        );
      }
    }

    // Create comment and increment video comment count in a transaction
    const comment = await prisma.$transaction(async (tx) => {
      const newComment = await tx.comment.create({
        data: {
          userId: currentUser.id,
          videoId,
          text: text.trim(),
          parentId: parentId || null,
        },
        include: {
          user: {
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

      await tx.video.update({
        where: { id: videoId },
        data: { commentsCount: { increment: 1 } },
      });

      // Notify video owner (don't notify yourself)
      if (video.creatorId !== currentUser.id) {
        await tx.notification.create({
          data: {
            userId: video.creatorId,
            type: "COMMENT",
            message: `${currentUser.displayName || currentUser.username} commented on your video`,
            relatedId: videoId,
          },
        });
      }

      return newComment;
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error: any) {
    if (error?.status === 401) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Create comment error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
