import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOwnerWithDevice } from "@/lib/auth";

const VALID_ROLES = ["OWNER", "BUG_TESTER", "END_USER"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireOwnerWithDevice();

    const { id } = await params;
    const body = await req.json();
    const { role } = body;

    if (!role || !VALID_ROLES.includes(role as ValidRole)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Owner can toggle themselves between OWNER and BUG_TESTER only
    if (target.id === currentUser.id) {
      if (role !== "OWNER" && role !== "BUG_TESTER") {
        return NextResponse.json(
          { error: "Owner can only switch between OWNER and BUG_TESTER" },
          { status: 400 }
        );
      }
    } else {
      // Cannot assign OWNER to someone else
      if (role === "OWNER") {
        return NextResponse.json(
          { error: "Cannot assign OWNER role to another user" },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { role: role as ValidRole },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
      },
    });

    return NextResponse.json({
      ok: true,
      user: updated,
    });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (error?.message === "Forbidden" || error?.message === "Device not allowed") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("Admin role change error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
