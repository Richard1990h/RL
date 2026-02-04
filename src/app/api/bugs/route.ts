import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// GET: List bug reports (admin only)
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { isOwner: true },
    });

    if (!fullUser?.isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const status = req.nextUrl.searchParams.get("status") || undefined;

    const bugs = await prisma.bugReport.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({ bugs });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: Submit a bug report (any logged-in user)
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { username: true, displayName: true },
    });

    if (!fullUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { title, description, page } = await req.json();

    if (!title || !description) {
      return NextResponse.json({ error: "Title and description are required" }, { status: 400 });
    }

    if (title.length > 200) {
      return NextResponse.json({ error: "Title too long (max 200 chars)" }, { status: 400 });
    }

    if (description.length > 5000) {
      return NextResponse.json({ error: "Description too long (max 5000 chars)" }, { status: 400 });
    }

    // Rate limit: max 5 bug reports per user per day
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCount = await prisma.bugReport.count({
      where: {
        userId: user.id,
        createdAt: { gte: dayAgo },
      },
    });

    if (recentCount >= 5) {
      return NextResponse.json({ error: "Too many bug reports. Max 5 per day." }, { status: 429 });
    }

    const bug = await prisma.bugReport.create({
      data: {
        userId: user.id,
        username: fullUser.username,
        displayName: fullUser.displayName,
        title: title.trim(),
        description: description.trim(),
        page: page || null,
      },
    });

    return NextResponse.json({ bug, ok: true });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Bug report error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
