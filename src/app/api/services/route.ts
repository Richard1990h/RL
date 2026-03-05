import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET: List services
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const creatorId = searchParams.get("creatorId");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 1));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      isActive: true,
    };

    if (category) {
      const validCategories = ["COACHING", "VIDEO_REVIEW", "CUSTOM_CONTENT", "SHOUTOUT", "COLLABORATION", "OTHER"];
      const upper = category.toUpperCase();
      if (validCategories.includes(upper)) {
        where.category = upper;
      }
    }

    if (creatorId) {
      where.creatorId = creatorId;
    }

    const [services, total] = await Promise.all([
      prisma.service.findMany({
        where,
        include: {
          creator: {
            select: { id: true, username: true, displayName: true, avatarUrl: true, verifiedBadge: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.service.count({ where }),
    ]);

    return NextResponse.json({
      services,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/services error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: Create a service
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!user.isCreator) {
      return NextResponse.json({ error: "Only creators can offer services" }, { status: 403 });
    }

    const body = await request.json();
    const { title, description, category, priceCredits, deliveryDays, maxOrders } = body;

    if (!title || !description || !category || !priceCredits) {
      return NextResponse.json(
        { error: "title, description, category, and priceCredits are required" },
        { status: 400 }
      );
    }

    // Map display names to enum values
    const categoryMap: Record<string, string> = {
      "1-on-1 coaching": "COACHING",
      "coaching": "COACHING",
      "video review": "VIDEO_REVIEW",
      "custom content": "CUSTOM_CONTENT",
      "shoutout": "SHOUTOUT",
      "collaboration": "COLLABORATION",
      "other": "OTHER",
    };
    const validEnums = ["COACHING", "VIDEO_REVIEW", "CUSTOM_CONTENT", "SHOUTOUT", "COLLABORATION", "OTHER"];
    const normalizedCategory = categoryMap[category.toLowerCase()] || category.toUpperCase().replace(/[\s-]+/g, "_");
    if (!validEnums.includes(normalizedCategory)) {
      return NextResponse.json({ error: `Invalid category: ${category}` }, { status: 400 });
    }

    const service = await prisma.service.create({
      data: {
        creatorId: user.id,
        title,
        description,
        category: normalizedCategory as any,
        priceCredits,
        deliveryDays: deliveryDays || 7,
        maxOrders: maxOrders || null,
      },
      include: {
        creator: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
    });

    return NextResponse.json({ service }, { status: 201 });
  } catch (error) {
    console.error("POST /api/services error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
