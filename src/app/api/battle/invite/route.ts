import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { InviteStatus } from "@/generated/prisma";

// POST - Create a new battle invitation
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { streamId, receiverId, message } = body;

  // Validate inputs
  if (!streamId || typeof streamId !== "string") {
    return NextResponse.json({ error: "Missing streamId" }, { status: 400 });
  }
  if (!receiverId || typeof receiverId !== "string") {
    return NextResponse.json({ error: "Missing receiverId" }, { status: 400 });
  }
  if (receiverId === user.id) {
    return NextResponse.json({ error: "Cannot invite yourself" }, { status: 400 });
  }

  try {
    // Verify sender has an active stream
    const senderStream = await prisma.liveStream.findFirst({
      where: {
        id: streamId,
        hostId: user.id,
        status: "LIVE",
      },
    });

    if (!senderStream) {
      return NextResponse.json(
        { error: "You must be hosting an active stream to send battle invitations" },
        { status: 400 }
      );
    }

    // Verify receiver exists and is currently live
    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
      include: {
        liveStreams: {
          where: { status: "LIVE" },
          take: 1,
        },
      },
    });

    if (!receiver) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (receiver.liveStreams.length === 0) {
      return NextResponse.json(
        { error: "The user you're inviting must be live to receive battle invitations" },
        { status: 400 }
      );
    }

    // Check for existing pending invitation
    const existingInvite = await prisma.battleInvitation.findFirst({
      where: {
        senderId: user.id,
        receiverId,
        status: InviteStatus.PENDING,
      },
    });

    if (existingInvite) {
      return NextResponse.json(
        { error: "You already have a pending invitation to this user" },
        { status: 400 }
      );
    }

    // Create invitation (expires in 5 minutes)
    const invitation = await prisma.battleInvitation.create({
      data: {
        streamId,
        senderId: user.id,
        receiverId,
        message: message || null,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      },
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
          },
        },
      },
    });

    // TODO: Send real-time notification to receiver via WebSocket/SSE

    return NextResponse.json({ success: true, invitation });
  } catch (error) {
    console.error("Failed to create battle invitation:", error);
    return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 });
  }
}

// GET - List pending invitations for current user
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "received"; // "received" or "sent"

  try {
    const now = new Date();

    // Auto-expire old invitations
    await prisma.battleInvitation.updateMany({
      where: {
        status: InviteStatus.PENDING,
        expiresAt: { lt: now },
      },
      data: {
        status: InviteStatus.EXPIRED,
      },
    });

    const where =
      type === "sent"
        ? { senderId: user.id, status: InviteStatus.PENDING }
        : { receiverId: user.id, status: InviteStatus.PENDING };

    const invitations = await prisma.battleInvitation.findMany({
      where,
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
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ invitations });
  } catch (error) {
    console.error("Failed to fetch battle invitations:", error);
    return NextResponse.json({ error: "Failed to fetch invitations" }, { status: 500 });
  }
}
