import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: videoId } = await params;

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true },
    });

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    await prisma.video.update({
      where: { id: videoId },
      data: { impressions: { increment: 1 } },
    });

    return NextResponse.json({ counted: true });
  } catch (error) {
    console.error("Impression tracking error:", error);
    return NextResponse.json(
      { error: "Failed to track impression" },
      { status: 500 }
    );
  }
}
