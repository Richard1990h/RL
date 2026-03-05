import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { InviteStatus } from "@/generated/prisma";

// PATCH - Accept or decline a battle invitation
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: invitationId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { action } = body as { action: "accept" | "decline" };

  if (!action || !["accept", "decline"].includes(action)) {
    return NextResponse.json(
      { error: "Invalid action. Must be 'accept' or 'decline'" },
      { status: 400 }
    );
  }

  try {
    // Get the invitation
    const invitation = await prisma.battleInvitation.findUnique({
      where: { id: invitationId },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
          },
        },
        liveStream: {
          select: {
            id: true,
            title: true,
            hostId: true,
            status: true,
          },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    // Verify the current user is the receiver
    if (invitation.receiverId !== user.id) {
      return NextResponse.json(
        { error: "You can only respond to invitations sent to you" },
        { status: 403 }
      );
    }

    // Check if invitation is still pending
    if (invitation.status !== InviteStatus.PENDING) {
      return NextResponse.json(
        { error: `Invitation has already been ${invitation.status.toLowerCase()}` },
        { status: 400 }
      );
    }

    // Check if invitation has expired
    if (new Date() > invitation.expiresAt) {
      await prisma.battleInvitation.update({
        where: { id: invitationId },
        data: { status: InviteStatus.EXPIRED },
      });
      return NextResponse.json({ error: "Invitation has expired" }, { status: 400 });
    }

    // Check if the sender's stream is still live
    if (invitation.liveStream.status !== "LIVE") {
      await prisma.battleInvitation.update({
        where: { id: invitationId },
        data: { status: InviteStatus.EXPIRED },
      });
      return NextResponse.json(
        { error: "The host's stream has ended" },
        { status: 400 }
      );
    }

    if (action === "decline") {
      // Decline the invitation
      const updated = await prisma.battleInvitation.update({
        where: { id: invitationId },
        data: { status: InviteStatus.DECLINED },
      });

      return NextResponse.json({
        success: true,
        message: "Invitation declined",
        invitation: updated,
      });
    }

    // Accept the invitation
    const updated = await prisma.battleInvitation.update({
      where: { id: invitationId },
      data: { status: InviteStatus.ACCEPTED },
    });

    // Add the receiver as a participant to the stream (as GUEST)
    await prisma.liveParticipant.upsert({
      where: {
        liveStreamId_userId: {
          liveStreamId: invitation.streamId,
          userId: user.id,
        },
      },
      create: {
        liveStreamId: invitation.streamId,
        userId: user.id,
        role: "GUEST",
        status: "ACTIVE",
      },
      update: {
        role: "GUEST",
        status: "ACTIVE",
      },
    });

    // TODO: Notify the sender via WebSocket/SSE that their invitation was accepted
    // TODO: Add the receiver to the battle queue in the game engine

    return NextResponse.json({
      success: true,
      message: "Invitation accepted! You've been added to the battle.",
      invitation: updated,
      streamId: invitation.streamId,
      streamTitle: invitation.liveStream.title,
    });
  } catch (error) {
    console.error("Failed to respond to battle invitation:", error);
    return NextResponse.json(
      { error: "Failed to respond to invitation" },
      { status: 500 }
    );
  }
}

// GET - Get a specific invitation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: invitationId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const invitation = await prisma.battleInvitation.findUnique({
      where: { id: invitationId },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            verifiedBadge: true,
          },
        },
        receiver: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            verifiedBadge: true,
          },
        },
        liveStream: {
          select: {
            id: true,
            title: true,
            mode: true,
            viewerCount: true,
            status: true,
          },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    // Only allow sender or receiver to view the invitation
    if (invitation.senderId !== user.id && invitation.receiverId !== user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json({ invitation });
  } catch (error) {
    console.error("Failed to fetch battle invitation:", error);
    return NextResponse.json(
      { error: "Failed to fetch invitation" },
      { status: 500 }
    );
  }
}

// DELETE - Cancel a sent invitation (sender only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: invitationId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const invitation = await prisma.battleInvitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    // Only the sender can cancel
    if (invitation.senderId !== user.id) {
      return NextResponse.json(
        { error: "You can only cancel invitations you sent" },
        { status: 403 }
      );
    }

    // Only pending invitations can be cancelled
    if (invitation.status !== InviteStatus.PENDING) {
      return NextResponse.json(
        { error: "Can only cancel pending invitations" },
        { status: 400 }
      );
    }

    await prisma.battleInvitation.delete({
      where: { id: invitationId },
    });

    return NextResponse.json({
      success: true,
      message: "Invitation cancelled",
    });
  } catch (error) {
    console.error("Failed to cancel battle invitation:", error);
    return NextResponse.json(
      { error: "Failed to cancel invitation" },
      { status: 500 }
    );
  }
}
