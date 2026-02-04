import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    const currentUser = await requireAuth();

    const timeouts = await prisma.friendTimeout.findMany({
      where: {
        ownerId: currentUser.id,
        expiresAt: { gt: new Date() },
      },
      select: {
        targetId: true,
        expiresAt: true,
      },
    });

    return NextResponse.json({ timeouts });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
