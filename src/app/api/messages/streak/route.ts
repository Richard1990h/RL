import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

function calculateStreakBonus(streakDays: number): { bonusCredits: number; nextTier: number | null; nextBonus: number | null } {
  const tiers = [
    { days: 20, credits: 5 },
    { days: 40, credits: 10 },
    { days: 60, credits: 15 },
    { days: 80, credits: 20 },
    { days: 100, credits: 25 },
    { days: 120, credits: 30 },
  ];

  let bonusCredits = 0;
  let nextTier: number | null = null;
  let nextBonus: number | null = null;

  for (const tier of tiers) {
    if (streakDays >= tier.days) {
      bonusCredits = tier.credits;
    } else {
      nextTier = tier.days;
      nextBonus = tier.credits;
      break;
    }
  }

  // If streak >= 120, cap bonus at 30 and no next tier (except 360 milestone)
  if (streakDays >= 120) {
    bonusCredits = 30;
    if (streakDays < 360) {
      nextTier = 360;
      nextBonus = 500;
    } else {
      nextTier = null;
      nextBonus = null;
    }
  }

  return { bonusCredits, nextTier, nextBonus };
}

// GET: Get all streaks for current user with bonus info
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const streaks = await prisma.messageStreak.findMany({
      where: {
        OR: [{ user1Id: user.id }, { user2Id: user.id }],
      },
      include: {
        user1: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
        user2: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { streakDays: "desc" },
    });

    const result = streaks.map((streak) => {
      const otherUser = streak.user1Id === user.id ? streak.user2 : streak.user1;
      const { bonusCredits, nextTier, nextBonus } = calculateStreakBonus(streak.streakDays);

      const isMilestone360 = streak.streakDays >= 360;

      return {
        id: streak.id,
        otherUser,
        streakDays: streak.streakDays,
        lastMessage: streak.lastMessage,
        bonusesPaid: streak.bonusesPaid,
        currentBonus: {
          creditsPerDay: bonusCredits,
          isCapped: streak.streakDays >= 120 && !isMilestone360,
        },
        nextTier: nextTier
          ? {
              daysRequired: nextTier,
              bonusCredits: nextBonus,
              daysRemaining: nextTier - streak.streakDays,
            }
          : null,
        milestone360: {
          reached: isMilestone360,
          reward: "$5.00 (500 credits)",
          daysRemaining: isMilestone360 ? 0 : 360 - streak.streakDays,
        },
      };
    });

    return NextResponse.json({ streaks: result });
  } catch (error) {
    console.error("GET /api/messages/streak error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
