import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { insertLedgerEntry } from "@/lib/credit-ledger";

// GET: List conversations for current user
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all messages involving the current user, grouped by the other participant
    const sentMessages = await prisma.message.findMany({
      where: {
        senderId: user.id,
        status: { not: "DELETED" },
      },
      include: {
        receiver: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, lastActiveAt: true, verifiedBadge: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const receivedMessages = await prisma.message.findMany({
      where: {
        receiverId: user.id,
        deletedForRecipientAt: null,
        status: { not: "DELETED" },
      },
      include: {
        sender: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, lastActiveAt: true, verifiedBadge: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Build conversation map
    const conversations = new Map<
      string,
      {
        otherUser: { id: string; username: string; displayName: string; avatarUrl: string | null };
        lastMessage: {
          id: string;
          text: string | null;
          mediaType: string | null;
          createdAt: Date;
          senderId: string;
          status: string;
        };
        unreadCount: number;
      }
    >();

    for (const msg of sentMessages) {
      const otherId = msg.receiverId;
      const existing = conversations.get(otherId);
      if (!existing || msg.createdAt > existing.lastMessage.createdAt) {
        conversations.set(otherId, {
          otherUser: msg.receiver,
          lastMessage: {
            id: msg.id,
            text: msg.text,
            mediaType: msg.mediaType,
            createdAt: msg.createdAt,
            senderId: msg.senderId,
            status: msg.status,
          },
          unreadCount: existing?.unreadCount ?? 0,
        });
      }
    }

    for (const msg of receivedMessages) {
      const otherId = msg.senderId;
      const existing = conversations.get(otherId);
      const unreadIncrement = msg.status === "SENT" || msg.status === "DELIVERED" ? 1 : 0;

      if (!existing || msg.createdAt > existing.lastMessage.createdAt) {
        conversations.set(otherId, {
          otherUser: msg.sender,
          lastMessage: {
            id: msg.id,
            text: msg.text,
            mediaType: msg.mediaType,
            createdAt: msg.createdAt,
            senderId: msg.senderId,
            status: msg.status,
          },
          unreadCount: (existing?.unreadCount ?? 0) + unreadIncrement,
        });
      } else if (existing) {
        existing.unreadCount += unreadIncrement;
      }
    }

    const result = Array.from(conversations.values()).sort(
      (a, b) => b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime()
    );

    return NextResponse.json({ conversations: result });
  } catch (error) {
    console.error("GET /api/messages error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: Send a message
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { receiverId, text, mediaUrl, mediaType, isPrivate, deleteAfter, viewTimerSec } = body;

    if (!receiverId) {
      return NextResponse.json({ error: "receiverId is required" }, { status: 400 });
    }

    if (!text && !mediaUrl) {
      return NextResponse.json({ error: "text or mediaUrl is required" }, { status: 400 });
    }

    // Check receiver exists
    const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
    if (!receiver) {
      return NextResponse.json({ error: "Receiver not found" }, { status: 404 });
    }

    // Check if either user has blocked the other
    const block = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: user.id, blockedId: receiverId },
          { blockerId: receiverId, blockedId: user.id },
        ],
      },
    });
    if (block) {
      return NextResponse.json({ error: "Cannot send messages to this user" }, { status: 403 });
    }

    // If isPrivate, deduct 1 credit from sender wallet
    let creditCost = 0;
    if (isPrivate) {
      const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
      if (!wallet || wallet.credits < 1) {
        return NextResponse.json({ error: "Insufficient credits for private message" }, { status: 402 });
      }
      creditCost = 1;
    }

    // Wrap credit deduction + message creation in a transaction
    const message = await prisma.$transaction(async (tx) => {
      if (isPrivate && creditCost > 0) {
        const msgTx = await tx.transaction.create({
          data: {
            userId: user.id,
            type: "CREDIT_SPENT",
            amountCents: 0,
            credits: 1,
            description: "Private message sent",
            status: "COMPLETED",
          },
        });

        // Ledger entry: race-safe debit
        await insertLedgerEntry(tx, {
          userId: user.id,
          deltaCredits: -1,
          type: "MESSAGE_COST",
          referenceId: msgTx.id,
          description: "Private message sent",
        });

        await tx.wallet.update({
          where: { userId: user.id },
          data: { totalSpent: { increment: 1 } },
        });
      }

      return tx.message.create({
        data: {
          senderId: user.id,
          receiverId,
          text: text || null,
          mediaUrl: mediaUrl || null,
          mediaType: mediaType
            ? (() => {
                const mt = mediaType.toUpperCase();
                if (mt === "PHOTO" || mt === "IMAGE") return "IMAGE";
                if (mt === "VIDEO") return "VIDEO";
                if (mt === "AUDIO") return "AUDIO";
                return "IMAGE";
              })()
            : null,
          isPrivate: isPrivate ?? false,
          deleteAfter: (() => {
            const val = (deleteAfter || "IMMEDIATELY").toUpperCase();
            const valid = ["IMMEDIATELY", "AFTER_24H", "WHEN_BOTH_LEAVE", "NEVER"];
            return (valid.includes(val) ? val : "IMMEDIATELY") as "IMMEDIATELY" | "AFTER_24H" | "WHEN_BOTH_LEAVE" | "NEVER";
          })(),
          viewTimerSec: viewTimerSec || null,
          creditCost,
          status: "SENT",
        },
        include: {
          sender: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
          receiver: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      });
    });

    // Update or create MessageStreak (non-critical — don't fail the request)
    try {
      const [u1, u2] = [user.id, receiverId].sort();
      const existingStreak = await prisma.messageStreak.findUnique({
        where: { user1Id_user2Id: { user1Id: u1, user2Id: u2 } },
      });

      if (existingStreak) {
        const lastMsgDate = new Date(existingStreak.lastMessage);
        const now = new Date();
        const hoursDiff = (now.getTime() - lastMsgDate.getTime()) / (1000 * 60 * 60);

        let newStreakDays = existingStreak.streakDays;
        if (hoursDiff >= 24 && hoursDiff < 48) {
          newStreakDays += 1;
        } else if (hoursDiff >= 48) {
          newStreakDays = 1;
        }

        await prisma.messageStreak.update({
          where: { user1Id_user2Id: { user1Id: u1, user2Id: u2 } },
          data: {
            streakDays: newStreakDays,
            lastMessage: new Date(),
          },
        });
      } else {
        await prisma.messageStreak.create({
          data: {
            user1Id: u1,
            user2Id: u2,
            streakDays: 1,
            lastMessage: new Date(),
          },
        });
      }
    } catch (streakErr) {
      console.error("MessageStreak update failed (non-critical):", streakErr);
    }

    // Create notification for receiver (non-critical — don't fail the request)
    try {
      const timeout = await prisma.friendTimeout.findFirst({
        where: {
          ownerId: receiverId,
          targetId: user.id,
          expiresAt: { gt: new Date() },
        },
      });

      if (!timeout) {
        await prisma.notification.create({
          data: {
            userId: receiverId,
            type: isPrivate ? "PRIVATE_MESSAGE" : "MESSAGE",
            message: isPrivate
              ? `${user.displayName || user.username} sent you a private message`
              : `${user.displayName || user.username} sent you a message`,
            relatedId: user.id,
          },
        });
      }
    } catch (notifErr) {
      console.error("Notification create failed (non-critical):", notifErr);
    }

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error("POST /api/messages error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
