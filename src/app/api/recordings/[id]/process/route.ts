import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { mergeRecordingChunks } from "@/lib/video-processing";

// POST - Trigger ffmpeg merge + compress of chunks into single MP4
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: recordingId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const recording = await prisma.recording.findUnique({
    where: { id: recordingId },
  });

  if (!recording || recording.userId !== user.id) {
    return NextResponse.json({ error: "Recording not found or not owned" }, { status: 403 });
  }

  // Allow filePath to be passed in the body (from client after chunk upload finalization)
  let filePath = recording.filePath;
  try {
    const body = await request.json();
    if (body.filePath) {
      filePath = body.filePath;
      await prisma.recording.update({
        where: { id: recordingId },
        data: { filePath },
      });
    }
  } catch {
    // No body or invalid JSON — use existing filePath
  }

  if (!filePath) {
    return NextResponse.json({ error: "No file path set" }, { status: 400 });
  }

  // Start processing in the background
  mergeRecordingChunks(recordingId, filePath).catch((err) => {
    console.error(`[recordings] Failed to process recording ${recordingId}:`, err);
  });

  return NextResponse.json({ status: "processing", recordingId });
}
