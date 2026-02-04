import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET - List recordings for the current user
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const recordings = await prisma.recording.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      liveStream: {
        select: { id: true, title: true, mode: true },
      },
    },
  });

  return NextResponse.json({ recordings });
}

// POST - Create a new recording record
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { liveStreamId, title, filePath } = body;

  if (!liveStreamId || !title) {
    return NextResponse.json({ error: "Missing liveStreamId or title" }, { status: 400 });
  }

  // Verify the user owns this stream
  const stream = await prisma.liveStream.findUnique({
    where: { id: liveStreamId },
  });

  if (!stream || stream.hostId !== user.id) {
    return NextResponse.json({ error: "Stream not found or not owned" }, { status: 403 });
  }

  const recording = await prisma.recording.create({
    data: {
      liveStreamId,
      userId: user.id,
      title,
      filePath: filePath || "",
      status: "PROCESSING",
    },
  });

  return NextResponse.json({ recording }, { status: 201 });
}
