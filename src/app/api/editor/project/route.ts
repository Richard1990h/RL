import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET - Load a project by mediaId
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mediaId = request.nextUrl.searchParams.get("mediaId");
  if (!mediaId) {
    return NextResponse.json({ error: "Missing mediaId" }, { status: 400 });
  }

  const project = await prisma.editorProject.findUnique({
    where: { userId_mediaId: { userId: user.id, mediaId } },
  });

  if (!project) {
    return NextResponse.json({ project: null });
  }

  return NextResponse.json({ project });
}

// POST - Save/update a project
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { mediaId, mediaType, title, editState } = body;

  if (!mediaId || !editState) {
    return NextResponse.json({ error: "Missing mediaId or editState" }, { status: 400 });
  }

  const project = await prisma.editorProject.upsert({
    where: { userId_mediaId: { userId: user.id, mediaId } },
    create: {
      userId: user.id,
      mediaId,
      mediaType: mediaType || "recording",
      title: title || "Untitled Project",
      editState,
    },
    update: {
      editState,
      title: title || undefined,
    },
  });

  return NextResponse.json({ project });
}

// DELETE - Delete a project
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mediaId = request.nextUrl.searchParams.get("mediaId");
  if (!mediaId) {
    return NextResponse.json({ error: "Missing mediaId" }, { status: 400 });
  }

  await prisma.editorProject.deleteMany({
    where: { userId: user.id, mediaId },
  });

  return NextResponse.json({ success: true });
}
