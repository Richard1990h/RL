import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET - Get a single recording (for polling progress)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const recording = await prisma.recording.findUnique({
      where: { id },
      include: {
        liveStream: { select: { id: true, title: true, mode: true } },
      },
    });

    if (!recording || recording.userId !== user.id) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
    }

    return NextResponse.json({ recording });
  } catch (error) {
    console.error("GET /api/recordings/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH - Update recording progress
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    const recording = await prisma.recording.findUnique({ where: { id } });
    if (!recording || recording.userId !== user.id) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (body.progress !== undefined) data.progress = Math.min(100, Math.max(0, Number(body.progress) || 0));
    if (body.status !== undefined) data.status = body.status;

    const updated = await prisma.recording.update({ where: { id }, data });
    return NextResponse.json({ recording: updated });
  } catch (error) {
    console.error("PATCH /api/recordings/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE - Delete a recording
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const recording = await prisma.recording.findUnique({
      where: { id },
    });

    if (!recording) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
    }

    if (recording.userId !== user.id) {
      return NextResponse.json({ error: "You can only delete your own recordings" }, { status: 403 });
    }

    await prisma.recording.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/recordings/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
