import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOwnerWithDevice } from "@/lib/auth";

const ALL_TYPES = [
  "FOLLOW", "LIKE", "COMMENT", "DONATION", "MESSAGE", "LIVE_START",
  "SUBSCRIPTION", "SERVICE_ORDER", "SYSTEM", "STREAK_BONUS",
  "FRIEND_REQUEST", "FRIEND_ACCEPT", "PRIVATE_MESSAGE",
] as const;

const TYPE_GROUPS: Record<string, string[]> = {
  system: ["SYSTEM"],
  messages: ["MESSAGE", "PRIVATE_MESSAGE"],
  social: ["FOLLOW", "LIKE", "COMMENT", "FRIEND_REQUEST", "FRIEND_ACCEPT", "STREAK_BONUS"],
  streams: ["LIVE_START", "DONATION", "SUBSCRIPTION", "SERVICE_ORDER"],
};

// GET: Fetch alerts with filters
export async function GET(request: NextRequest) {
  try {
    await requireOwnerWithDevice();

    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get("type") || "all";
    const readFilter = searchParams.get("read") || "all";
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const before = searchParams.get("before");

    // Build where clause
    const where: Record<string, unknown> = {};

    // Type filter
    if (typeFilter !== "all" && TYPE_GROUPS[typeFilter]) {
      where.type = { in: TYPE_GROUPS[typeFilter] };
    } else if (typeFilter !== "all" && ALL_TYPES.includes(typeFilter as any)) {
      where.type = typeFilter;
    }

    // Read filter
    if (readFilter === "true" || readFilter === "read") {
      where.read = true;
    } else if (readFilter === "false" || readFilter === "unread") {
      where.read = false;
    }

    // Cursor-based pagination
    if (before) {
      where.createdAt = { lt: new Date(before) };
    }

    const [alerts, totalCount, unreadCount, fraudCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { user: { select: { username: true, displayName: true } } },
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { ...where, read: false },
      }),
      prisma.notification.count({
        where: {
          type: "SYSTEM",
          message: { contains: "FRAUD" },
        },
      }),
    ]);

    return NextResponse.json({
      alerts,
      totalCount,
      unreadCount,
      fraudCount,
      hasMore: alerts.length === limit,
    });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (error?.message === "Forbidden" || error?.message === "Device not allowed") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("GET /api/admin/alerts error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT: Mark alerts as read
export async function PUT(request: NextRequest) {
  try {
    await requireOwnerWithDevice();

    const body = await request.json();
    const { ids, all } = body;

    if (all) {
      const result = await prisma.notification.updateMany({
        where: { read: false },
        data: { read: true },
      });
      return NextResponse.json({ success: true, count: result.count });
    }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids array or all:true is required" }, { status: 400 });
    }

    const result = await prisma.notification.updateMany({
      where: { id: { in: ids } },
      data: { read: true },
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (error?.message === "Forbidden" || error?.message === "Device not allowed") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("PUT /api/admin/alerts error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE: Dismiss/delete alerts
export async function DELETE(request: NextRequest) {
  try {
    await requireOwnerWithDevice();

    const body = await request.json();
    const { ids, all } = body;

    if (all) {
      const result = await prisma.notification.deleteMany({});
      return NextResponse.json({ success: true, count: result.count });
    }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids array or all:true is required" }, { status: 400 });
    }

    const result = await prisma.notification.deleteMany({
      where: { id: { in: ids } },
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (error?.message === "Forbidden" || error?.message === "Device not allowed") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("DELETE /api/admin/alerts error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
