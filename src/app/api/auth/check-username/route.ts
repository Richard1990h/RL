import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const username = req.nextUrl.searchParams.get("username");

    if (!username || username.length < 3) {
      return NextResponse.json({ available: false, username: username || "" });
    }

    const existing = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });

    return NextResponse.json({
      available: !existing,
      username: username.toLowerCase(),
    });
  } catch (error) {
    console.error("GET /api/auth/check-username error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
