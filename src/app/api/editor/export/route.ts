import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { exportEditedVideo } from "@/lib/video-processing";

// In-memory export job tracking
const exportJobs = new Map<string, { status: string; outputUrl?: string; error?: string }>();

// POST - Start an export job
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    recordingId,
    trimStart,
    trimEnd,
    cuts,
    textOverlays,
    filters,
    speedSegments,
    audio,
    transitions,
    crop,
    freezeFrames,
    stickers,
    resolution,
    format,
    quality,
  } = body;

  if (!recordingId) {
    return NextResponse.json({ error: "Missing recordingId" }, { status: 400 });
  }

  const recording = await prisma.recording.findUnique({
    where: { id: recordingId },
  });

  if (!recording || recording.userId !== user.id) {
    return NextResponse.json({ error: "Recording not found or not owned" }, { status: 403 });
  }

  if (!recording.filePath || recording.status !== "READY") {
    return NextResponse.json({ error: "Recording not ready" }, { status: 400 });
  }

  const exportId = `export_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const ext = format === "webm" ? "webm" : "mp4";
  const outputName = `edited_${recordingId}_${Date.now()}.${ext}`;

  // Track the job
  exportJobs.set(exportId, { status: "exporting" });

  // Run export in background
  exportEditedVideo(recording.filePath, outputName, {
    trimStart,
    trimEnd,
    cuts,
    textOverlays,
    filters,
    speedSegments,
    audio,
    transitions,
    crop,
    freezeFrames,
    stickers,
    resolution: resolution || "1080p",
    format: format || "mp4",
    quality: quality || "standard",
  })
    .then((outputUrl) => {
      exportJobs.set(exportId, { status: "done", outputUrl });

      // Auto-cleanup after 10 minutes
      setTimeout(() => exportJobs.delete(exportId), 600000);
    })
    .catch((err) => {
      exportJobs.set(exportId, { status: "error", error: String(err) });
      setTimeout(() => exportJobs.delete(exportId), 600000);
    });

  return NextResponse.json({ exportId, status: "exporting" });
}

// GET - Check export status
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const exportId = request.nextUrl.searchParams.get("exportId");
  if (!exportId) {
    return NextResponse.json({ error: "Missing exportId" }, { status: 400 });
  }

  const job = exportJobs.get(exportId);
  if (!job) {
    return NextResponse.json({ error: "Export not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}
