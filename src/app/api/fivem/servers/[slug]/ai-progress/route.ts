import { NextRequest, NextResponse } from "next/server";
import { getAiProgress, getActiveAiJobs, cleanupOldEntries } from "@/lib/fivem/ai-progress";

// GET /api/fivem/servers/[slug]/ai-progress?id=xxx or ?all=true
export async function GET(req: NextRequest) {
  cleanupOldEntries();

  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const bugProgress = getAiProgress(`bug-${id}`);
    const sugProgress = getAiProgress(`suggestion-${id}`);
    return NextResponse.json({ progress: bugProgress || sugProgress || null });
  }

  // Return all active jobs
  const active = getActiveAiJobs();
  return NextResponse.json({ active });
}
