import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOwnerWithDevice } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await requireOwnerWithDevice();

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const search = searchParams.get("search") || "";
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { username: { contains: search } },
            { displayName: { contains: search } },
            { email: { contains: search } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          wallet: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    const sanitizedUsers = users.map((u) => ({
      id: u.id,
      email: u.email,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      isCreator: u.isCreator,
      verifiedBadge: u.verifiedBadge,
      isPremium: u.isPremium,
      isOwner: u.isOwner,
      isBanned: u.isBanned,
      role: u.role,
      followerCount: u.followerCount,
      followingCount: u.followingCount,
      lastActiveAt: u.lastActiveAt,
      createdAt: u.createdAt,
      wallet: u.wallet
        ? {
            credits: u.wallet.credits,
            totalEarned: u.wallet.totalEarned,
            totalSpent: u.wallet.totalSpent,
          }
        : null,
    }));

    return NextResponse.json({
      users: sanitizedUsers,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (error?.message === "Forbidden" || error?.message === "Device not allowed") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("Admin users error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
