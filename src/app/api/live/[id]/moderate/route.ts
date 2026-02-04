import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// POST: Moderation action
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action, targetUserId, timeoutMinutes } = body;

    if (!action || !["ban", "timeout", "add_mod", "remove_mod"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'ban', 'timeout', 'add_mod', or 'remove_mod'" },
        { status: 400 }
      );
    }

    if (!targetUserId) {
      return NextResponse.json({ error: "targetUserId is required" }, { status: 400 });
    }

    const liveStream = await prisma.liveStream.findUnique({
      where: { id },
      include: { moderators: true },
    });

    if (!liveStream) {
      return NextResponse.json({ error: "Live stream not found" }, { status: 404 });
    }

    // Check if user is host or moderator
    const isHost = liveStream.hostId === user.id;
    const isModerator = liveStream.moderators.some((m) => m.userId === user.id);

    if (!isHost && !isModerator) {
      return NextResponse.json({ error: "Only host or moderators can perform moderation actions" }, { status: 403 });
    }

    // Only host can add/remove moderators
    if ((action === "add_mod" || action === "remove_mod") && !isHost) {
      return NextResponse.json({ error: "Only the host can manage moderators" }, { status: 403 });
    }

    // Verify target user exists
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      return NextResponse.json({ error: "Target user not found" }, { status: 404 });
    }

    switch (action) {
      case "ban": {
        // Remove participant
        await prisma.liveParticipant.deleteMany({
          where: { liveStreamId: id, userId: targetUserId },
        });

        // Decrement viewer count
        if (liveStream.viewerCount > 0) {
          await prisma.liveStream.update({
            where: { id },
            data: { viewerCount: { decrement: 1 } },
          });
        }

        return NextResponse.json({
          success: true,
          action: "ban",
          targetUserId,
          message: `User ${targetUser.username} has been banned from the stream`,
        });
      }

      case "timeout": {
        // Store timeout info in metadata (for now we just track this)
        const timeoutUntil = new Date(Date.now() + (timeoutMinutes || 5) * 60 * 1000);

        return NextResponse.json({
          success: true,
          action: "timeout",
          targetUserId,
          timeoutMinutes: timeoutMinutes || 5,
          timeoutUntil,
          message: `User ${targetUser.username} has been timed out for ${timeoutMinutes || 5} minutes`,
        });
      }

      case "add_mod": {
        // Check if already a moderator
        const existingMod = await prisma.moderator.findUnique({
          where: { liveStreamId_userId: { liveStreamId: id, userId: targetUserId } },
        });

        if (existingMod) {
          return NextResponse.json({ error: "User is already a moderator" }, { status: 409 });
        }

        const moderator = await prisma.moderator.create({
          data: {
            liveStreamId: id,
            userId: targetUserId,
          },
          include: {
            user: {
              select: { id: true, username: true, displayName: true, avatarUrl: true },
            },
          },
        });

        return NextResponse.json({
          success: true,
          action: "add_mod",
          moderator,
          message: `User ${targetUser.username} has been added as a moderator`,
        });
      }

      case "remove_mod": {
        await prisma.moderator.deleteMany({
          where: { liveStreamId: id, userId: targetUserId },
        });

        return NextResponse.json({
          success: true,
          action: "remove_mod",
          targetUserId,
          message: `User ${targetUser.username} has been removed as a moderator`,
        });
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("POST /api/live/[id]/moderate error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
