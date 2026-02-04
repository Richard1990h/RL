import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const series = await prisma.series.findUnique({
      where: { id },
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
            title: true,
            description: true,
            thumbnailUrl: true,
            durationSec: true,
            views: true,
            likes: true,
            seriesOrder: true,
            uploadDate: true,
          },
        },
      },
    });

    if (!series) {
      return NextResponse.json(
        { error: "Series not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ series });
  } catch (error) {
    console.error("Get series error:", error);
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

    const series = await prisma.series.findUnique({
      where: { id },
    });

    if (!series) {
      return NextResponse.json(
        { error: "Series not found" },
        { status: 404 }
      );
    }

    if (series.creatorId !== currentUser.id) {
      return NextResponse.json(
        { error: "You can only update your own series" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { title, description, coverUrl } = body;

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
    if (coverUrl !== undefined) updateData.coverUrl = coverUrl;

    const updatedSeries = await prisma.series.update({
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

    return NextResponse.json({ series: updatedSeries });
  } catch (error: any) {
    if (error?.status === 401) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Update series error:", error);
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

    const series = await prisma.series.findUnique({
      where: { id },
    });

    if (!series) {
      return NextResponse.json(
        { error: "Series not found" },
        { status: 404 }
      );
    }

    if (series.creatorId !== currentUser.id) {
      return NextResponse.json(
        { error: "You can only delete your own series" },
        { status: 403 }
      );
    }

    // Unlink all episodes from the series first, then delete
    await prisma.$transaction([
      prisma.video.updateMany({
        where: { seriesId: id },
        data: { seriesId: null, seriesOrder: null },
      }),
      prisma.series.delete({
        where: { id },
      }),
    ]);

    return NextResponse.json({ message: "Series deleted successfully" });
  } catch (error: any) {
    if (error?.status === 401) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Delete series error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
