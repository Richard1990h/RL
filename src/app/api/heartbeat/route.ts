import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Heartbeat update failed:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
