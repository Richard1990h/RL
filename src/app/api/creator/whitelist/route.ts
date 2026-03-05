import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET: List all whitelisted users for the current user
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const entries = await prisma.streamWhitelist.findMany({
      where: { userId: user.id },
      include: {
        whitelisted: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      whitelist: entries.map((e) => ({
        id: e.whitelistedId,
        username: e.whitelisted.username,
        displayName: e.whitelisted.displayName,
        avatarUrl: e.whitelisted.avatarUrl,
        addedAt: e.createdAt,
      })),
    });
  } catch (error) {
    console.error("GET /api/creator/whitelist error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: Add a user to the whitelist
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { whitelistedId } = body;

    if (!whitelistedId || typeof whitelistedId !== "string") {
      return NextResponse.json({ error: "whitelistedId is required" }, { status: 400 });
    }

    if (whitelistedId === user.id) {
      return NextResponse.json({ error: "Cannot whitelist yourself" }, { status: 400 });
    }

    // Verify the target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: whitelistedId },
      select: { id: true, displayName: true, username: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Upsert to avoid duplicates
    await prisma.streamWhitelist.upsert({
      where: {
        userId_whitelistedId: {
          userId: user.id,
          whitelistedId,
        },
      },
      create: {
        userId: user.id,
        whitelistedId,
      },
      update: {},
    });

    return NextResponse.json({ success: true, whitelistedId });
  } catch (error) {
    console.error("POST /api/creator/whitelist error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE: Remove a user from the whitelist
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { whitelistedId } = body;

    if (!whitelistedId || typeof whitelistedId !== "string") {
      return NextResponse.json({ error: "whitelistedId is required" }, { status: 400 });
    }

    await prisma.streamWhitelist.deleteMany({
      where: {
        userId: user.id,
        whitelistedId,
      },
    });

    return NextResponse.json({ success: true, whitelistedId });
  } catch (error) {
    console.error("DELETE /api/creator/whitelist error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
