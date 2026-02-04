import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// POST: Save Claude's parsed response back to a bug record
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { isOwner: true },
    });

    if (!fullUser?.isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { type, content } = body;

    const bug = await prisma.bugReport.findUnique({ where: { id } });
    if (!bug) {
      return NextResponse.json({ error: "Bug report not found" }, { status: 404 });
    }

    const data: any = {};

    if (type === "diagnosis" && bug.status === "INVESTIGATING") {
      // Parse CATEGORY line
      const categoryMatch = content.match(/CATEGORY:\s*(BUG|UPGRADE|BOTH)/i);
      const category = categoryMatch ? categoryMatch[1].toUpperCase() : "BUG";

      // Extract BUG section
      if (category === "BUG" || category === "BOTH") {
        const bugMatch = content.match(/BUG:\s*([\s\S]*?)(?=UPGRADE:|$)/);
        data.diagnosis = bugMatch ? bugMatch[0].trim() : content;
      }

      // Extract UPGRADE section
      if (category === "UPGRADE" || category === "BOTH") {
        const upgradeMatch = content.match(/UPGRADE:\s*([\s\S]*?)$/);
        data.upgradeRequest = upgradeMatch ? upgradeMatch[0].trim() : null;
      }

      data.status = "DIAGNOSED";
    } else if (type === "fix" && bug.status === "FIXING") {
      data.fixResult = content;
      data.status = "FIXED";
    } else if (type === "verification" && bug.status === "TESTING") {
      data.testResult = content;
      // Check if PASS or FAIL
      const passMatch = /Status:\s*PASS/i.test(content);
      data.status = passMatch ? "RESOLVED" : "FAILED";
      if (passMatch) {
        data.resolvedAt = new Date();
      }
    } else {
      return NextResponse.json(
        { error: `Invalid type "${type}" for bug in status "${bug.status}"` },
        { status: 400 }
      );
    }

    const updated = await prisma.bugReport.update({
      where: { id },
      data,
    });

    return NextResponse.json({ bug: updated, ok: true });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
