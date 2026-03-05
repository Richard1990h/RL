import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { insertLedgerEntries } from "@/lib/credit-ledger";
import { getGameEngine, broadcastGameEvent } from "@/lib/games/game-state-manager";
import { getPowerUpConfig, getPowerUpCost, getPowerUpDuration } from "@/lib/games/power-ups";
import type { PowerUpType } from "@/lib/games/power-ups";
import type { LedgerEntry } from "@/lib/credit-ledger";
import { v4 as uuidv4 } from "uuid";

// POST - Purchase and activate a power-up during battles
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: streamId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { type, targetId } = body as { type: PowerUpType; targetId?: string };

  // Validate power-up type
  const config = getPowerUpConfig(type);
  if (!config) {
    return NextResponse.json({ error: "Invalid power-up type" }, { status: 400 });
  }

  // Verify game engine exists
  const engine = getGameEngine(streamId);
  if (!engine) {
    return NextResponse.json({ error: "No active game" }, { status: 404 });
  }

  const state = engine.currentState;

  // Validate game is active (or allow during victory lap for certain power-ups)
  if (state.phase !== "active") {
    return NextResponse.json({ error: "Game is not active" }, { status: 400 });
  }

  // Validate target based on power-up type
  let resolvedTargetId: string | null = null;

  switch (config.targetType) {
    case "self":
      // Target is the purchaser
      resolvedTargetId = user.id;
      // Validate user is a player in the game
      if (!state.players[user.id]) {
        return NextResponse.json({ error: "You are not a player in this game" }, { status: 400 });
      }
      if (state.players[user.id].isEliminated) {
        return NextResponse.json({ error: "You are eliminated" }, { status: 400 });
      }
      break;

    case "opponent":
      // Target must be specified and be another player
      if (!targetId) {
        return NextResponse.json({ error: "Target player required" }, { status: 400 });
      }
      if (targetId === user.id) {
        return NextResponse.json({ error: "Cannot target yourself with this power-up" }, { status: 400 });
      }
      const targetPlayer = state.players[targetId];
      if (!targetPlayer) {
        return NextResponse.json({ error: "Target is not a player in this game" }, { status: 400 });
      }
      if (targetPlayer.isEliminated) {
        return NextResponse.json({ error: "Target is eliminated" }, { status: 400 });
      }
      resolvedTargetId = targetId;
      break;

    case "stream":
      // Stream-wide effect (like TIME_MAKER)
      resolvedTargetId = null;
      break;
  }

  // Check TIME_MAKER limit
  if (type === "TIME_MAKER") {
    const timeExtensionsUsed = (state.data.timeExtensionsUsed as number) || 0;
    const maxTimeExtensions = (state.data.maxTimeExtensions as number) || 5;
    if (timeExtensionsUsed >= maxTimeExtensions) {
      return NextResponse.json({ error: "Maximum time extensions reached for this battle" }, { status: 400 });
    }
  }

  const cost = getPowerUpCost(type);
  const duration = getPowerUpDuration(type);
  const purchaseRef = uuidv4();

  try {
    // Transaction: deduct credits and create power-up record
    await prisma.$transaction(async (tx) => {
      // Check user has sufficient credits
      const wallet = await tx.wallet.findUnique({
        where: { userId: user.id },
      });

      if (!wallet || wallet.credits < cost) {
        throw new Error("Insufficient credits");
      }

      // Deduct credits
      const entries: LedgerEntry[] = [
        {
          userId: user.id,
          deltaCredits: -cost,
          type: "SPEND",
          referenceId: `power_up_${purchaseRef}`,
          description: `Power-up purchase: ${config.name} in stream ${streamId}`,
        },
      ];

      await insertLedgerEntries(tx, entries);

      await tx.wallet.update({
        where: { userId: user.id },
        data: {
          credits: { decrement: cost },
          totalSpent: { increment: cost }
        },
      });

      // Create power-up record in database
      await tx.powerUp.create({
        data: {
          streamId,
          userId: user.id,
          targetId: resolvedTargetId,
          type: type as "BOOSTING_GLOVE" | "MAGIC_MIST" | "STUN_HAMMER" | "TIME_MAKER",
          costCredits: cost,
          expiresAt: duration > 0 ? new Date(Date.now() + duration) : null,
        },
      });
    });

    // Dispatch game action to update game state
    engine.processAction({
      type: "power_up",
      userId: user.id,
      payload: { type, targetId: resolvedTargetId },
      timestamp: Date.now(),
    });

    // Broadcast power-up activation event
    broadcastGameEvent(streamId, "power_up", {
      userId: user.id,
      userName: user.displayName,
      type,
      powerUpName: config.name,
      targetId: resolvedTargetId,
      targetName: resolvedTargetId ? state.players[resolvedTargetId]?.displayName : null,
      duration,
      expiresAt: duration > 0 ? Date.now() + duration : null,
    });

    return NextResponse.json({
      success: true,
      powerUp: {
        type,
        name: config.name,
        targetId: resolvedTargetId,
        duration,
        expiresAt: duration > 0 ? Date.now() + duration : null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Transaction failed";
    if (message.includes("Insufficient credits")) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 400 });
    }
    console.error("Power-up purchase failed:", error);
    return NextResponse.json({ error: "Power-up purchase failed" }, { status: 500 });
  }
}

// GET - Get active power-ups for the stream
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: streamId } = await params;

  const engine = getGameEngine(streamId);
  if (!engine) {
    return NextResponse.json({ error: "No active game" }, { status: 404 });
  }

  const state = engine.currentState;
  const activePowerUps = state.data.activePowerUps || [];

  return NextResponse.json({ activePowerUps });
}
