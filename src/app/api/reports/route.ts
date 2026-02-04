import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// POST: File a report
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { reportedId, reason, type, contentId } = body;

    if (!reportedId || !reason || !type) {
      return NextResponse.json(
        { error: "reportedId, reason, and type are required" },
        { status: 400 }
      );
    }

    const validTypes = ["USER", "VIDEO", "COMMENT", "LIVE_STREAM", "MESSAGE"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Cannot report yourself
    if (reportedId === user.id) {
      return NextResponse.json({ error: "Cannot report yourself" }, { status: 400 });
    }

    // Check reported user exists
    const reportedUser = await prisma.user.findUnique({ where: { id: reportedId } });
    if (!reportedUser) {
      return NextResponse.json({ error: "Reported user not found" }, { status: 404 });
    }

    const report = await prisma.report.create({
      data: {
        reporterId: user.id,
        reportedId,
        reason,
        type,
        contentId: contentId || null,
        status: "PENDING",
      },
    });

    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    console.error("POST /api/reports error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
