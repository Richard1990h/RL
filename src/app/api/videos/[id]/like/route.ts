import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: videoId } = await params;
    const currentUser = await requireAuth();

    const body = await req.json();
    const { isLike } = body;

    if (typeof isLike !== "boolean") {
      return NextResponse.json(
        { error: "isLike must be a boolean" },
        { status: 400 }
      );
    }

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

    // Check for existing like
    const existingLike = await prisma.like.findUnique({
      where: {
        userId_videoId: {
          userId: currentUser.id,
          videoId,
        },
      },
    });

    let action: "liked" | "disliked" | "removed";

    await prisma.$transaction(async (tx) => {
      if (existingLike) {
        if (existingLike.isLike === isLike) {
          // Same action - remove the like/dislike (toggle off)
          await tx.like.delete({
            where: { id: existingLike.id },
          });

          if (isLike) {
            await tx.video.update({
              where: { id: videoId },
              data: { likes: { decrement: 1 } },
            });
          } else {
            await tx.video.update({
              where: { id: videoId },
              data: { dislikes: { decrement: 1 } },
            });
          }

          action = "removed";
        } else {
          // Opposite action - switch
          await tx.like.update({
            where: { id: existingLike.id },
            data: { isLike },
          });

          if (isLike) {
            // Switching from dislike to like
            await tx.video.update({
              where: { id: videoId },
              data: {
                likes: { increment: 1 },
                dislikes: { decrement: 1 },
              },
            });
            action = "liked";
          } else {
            // Switching from like to dislike
            await tx.video.update({
              where: { id: videoId },
              data: {
                likes: { decrement: 1 },
                dislikes: { increment: 1 },
              },
            });
            action = "disliked";
          }
        }
      } else {
        // No existing like - create new
        await tx.like.create({
          data: {
            userId: currentUser.id,
            videoId,
            isLike,
          },
        });

        if (isLike) {
          await tx.video.update({
            where: { id: videoId },
            data: { likes: { increment: 1 } },
          });
          action = "liked";
        } else {
          await tx.video.update({
            where: { id: videoId },
            data: { dislikes: { increment: 1 } },
          });
          action = "disliked";
        }
      }
    });

    // Fetch updated counts
    const updatedVideo = await prisma.video.findUnique({
      where: { id: videoId },
      select: { likes: true, dislikes: true },
    });

    return NextResponse.json({
      action: action!,
      likes: updatedVideo!.likes,
      dislikes: updatedVideo!.dislikes,
    });
  } catch (error: any) {
    if (error?.status === 401) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Like error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
