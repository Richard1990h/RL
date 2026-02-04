import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { displayName } = await req.json();

    if (!displayName || typeof displayName !== "string") {
      return NextResponse.json({ error: "displayName required" }, { status: 400 });
    }

    // MySQL's default utf8 collation handles case-insensitivity
    const existing = await prisma.user.findFirst({
      where: { displayName: displayName },
    });

    return NextResponse.json({ available: !existing });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
