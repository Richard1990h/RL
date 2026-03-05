import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { insertLedgerEntries } from "@/lib/credit-ledger";
import { getGameEngine, broadcastGameEvent } from "@/lib/games/game-state-manager";
import { DONATION_TIERS, TOWER_WARS_STATS } from "@/lib/donation-tiers";
import type { LedgerEntry } from "@/lib/credit-ledger";
import { v4 as uuidv4 } from "uuid";

// POST - Send a real credit gift to a player during games
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
  const { targetUserId, amount } = body;

  // Validate inputs
  if (!amount || typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive integer" }, { status: 400 });
  }

  // Verify game engine exists
  const engine = getGameEngine(streamId);
  if (!engine) {
    return NextResponse.json({ error: "No active game" }, { status: 404 });
  }

  const state = engine.currentState;
  const mode = state.mode;

  if (mode !== "tower_wars" && (!targetUserId || typeof targetUserId !== "string")) {
    return NextResponse.json({ error: "Missing targetUserId" }, { status: 400 });
  }

  // Tower Wars specific validation
  if (mode === "tower_wars") {
    const { tierId, supportingId } = body;
    const objectiveTowerOwnerId = String(state.data.objectiveTowerOwnerId || state.data.hostId || "");

    if (!tierId || typeof tierId !== "string") {
      return NextResponse.json({ error: "Missing tierId" }, { status: 400 });
    }
    if (!supportingId || typeof supportingId !== "string") {
      return NextResponse.json({ error: "Missing supportingId" }, { status: 400 });
    }

    const stats = TOWER_WARS_STATS[tierId];
    if (!stats) {
      return NextResponse.json({ error: "Invalid tierId" }, { status: 400 });
    }

    const tier = DONATION_TIERS.find((t) => t.id === tierId);
    if (!tier) {
      return NextResponse.json({ error: "Invalid tierId" }, { status: 400 });
    }

    // Validate supporting player exists and is active
    const supportPlayer = state.players[supportingId];
    if (!supportPlayer) {
      return NextResponse.json({ error: "Supporting player not in game" }, { status: 400 });
    }
    if (supportPlayer.isEliminated) {
      return NextResponse.json({ error: "Supporting player is eliminated" }, { status: 400 });
    }

    // V1 tower wars is auto-targeted: all attacks/heals apply to the single objective tower.
    if (!objectiveTowerOwnerId) {
      return NextResponse.json({ error: "Objective tower is not initialized" }, { status: 400 });
    }

    // Calculate host cut
    const hostCutPercent = (state.data.hostCutPercent as number) || 0;
    const hostId = state.data.hostId as string;
    const hostCutAmount = Math.floor(amount * hostCutPercent / 100);
    const playerAmount = amount - hostCutAmount;
    const giftRef = uuidv4();

    try {
      await prisma.$transaction(async (tx) => {
        const entries: LedgerEntry[] = [
          {
            userId: user.id,
            deltaCredits: -amount,
            type: "GAME_GIFT_OUT",
            referenceId: `gift_out_${giftRef}`,
            description: `Tower Wars gift (${tier.name}) in stream ${streamId}`,
          },
        ];

        if (hostCutAmount > 0 && hostId) {
          entries.push({
            userId: hostId,
            deltaCredits: hostCutAmount,
            type: "GAME_HOST_CUT",
            referenceId: `host_cut_${giftRef}`,
            description: `Host cut (${hostCutPercent}%) from Tower Wars gift in stream ${streamId}`,
          });
        }

        await insertLedgerEntries(tx, entries);

        await tx.wallet.update({
          where: { userId: user.id },
          data: { totalSpent: { increment: amount } },
        });

        if (hostCutAmount > 0 && hostId) {
          await tx.wallet.update({
            where: { userId: hostId },
            data: { totalEarned: { increment: hostCutAmount } },
          });
        }
      });

      // Process game action based on unit type
      if (stats.type === "heal") {
        engine.processAction({
          type: "heal",
          userId: supportingId,
          payload: { targetId: objectiveTowerOwnerId, healAmount: stats.healAmount },
          timestamp: Date.now(),
        });
      } else {
        engine.processAction({
          type: "spawn_unit",
          userId: supportingId,
          payload: {
            tierId,
            supportingId,
            targetId: objectiveTowerOwnerId,
            hp: stats.hp,
            maxHp: stats.hp,
            damage: stats.damage,
            speed: stats.speed,
            iconKey: tier.iconKey,
          },
          timestamp: Date.now(),
        });
      }

      // Track earnings for the supporting player
      const earnings = (state.data.playerEarnings as Record<string, number>) || {};
      earnings[supportingId] = (earnings[supportingId] || 0) + playerAmount;
      state.data.playerEarnings = earnings;

      broadcastGameEvent(streamId, "gift", {
        senderId: user.id,
        senderName: user.displayName,
        targetUserId: objectiveTowerOwnerId,
        supportingId,
        tierId,
        tierName: tier.name,
        tierIcon: tier.iconKey,
        unitType: stats.type,
        amount,
        playerAmount,
        hostCutAmount,
      });

      return NextResponse.json({ success: true, playerAmount, hostCutAmount });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Transaction failed";
      if (message.includes("Insufficient credits")) {
        return NextResponse.json({ error: "Insufficient credits" }, { status: 400 });
      }
      console.error("Gift transaction failed:", error);
      return NextResponse.json({ error: "Gift failed" }, { status: 500 });
    }
  }

  // Timer Wars (and other modes): original logic
  if (targetUserId === user.id) {
    return NextResponse.json({ error: "Cannot gift yourself" }, { status: 400 });
  }

  const targetPlayer = state.players[targetUserId];
  if (!targetPlayer) {
    return NextResponse.json({ error: "Target is not a player in this game" }, { status: 400 });
  }
  if (targetPlayer.isEliminated) {
    return NextResponse.json({ error: "Target is eliminated" }, { status: 400 });
  }

  // Calculate host cut
  const hostCutPercent = (state.data.hostCutPercent as number) || 0;
  const hostId = state.data.hostId as string;
  const hostCutAmount = Math.floor(amount * hostCutPercent / 100);
  const playerAmount = amount - hostCutAmount;

  const giftRef = uuidv4();

  try {
    await prisma.$transaction(async (tx) => {
      const entries: LedgerEntry[] = [
        {
          userId: user.id,
          deltaCredits: -amount,
          type: "GAME_GIFT_OUT",
          referenceId: `gift_out_${giftRef}`,
          description: `Game gift to ${targetPlayer.displayName} in stream ${streamId}`,
        },
      ];

      if (hostCutAmount > 0 && hostId) {
        entries.push({
          userId: hostId,
          deltaCredits: hostCutAmount,
          type: "GAME_HOST_CUT",
          referenceId: `host_cut_${giftRef}`,
          description: `Host cut (${hostCutPercent}%) from game gift in stream ${streamId}`,
        });
      }

      await insertLedgerEntries(tx, entries);

      await tx.wallet.update({
        where: { userId: user.id },
        data: { totalSpent: { increment: amount } },
      });

      if (hostCutAmount > 0 && hostId) {
        await tx.wallet.update({
          where: { userId: hostId },
          data: { totalEarned: { increment: hostCutAmount } },
        });
      }
    });

    // Update game score
    engine.processAction({
      type: "gift",
      userId: targetUserId,
      payload: { amount: playerAmount },
      timestamp: Date.now(),
    });

    // Track earnings for elimination payout
    const earnings = (state.data.playerEarnings as Record<string, number>) || {};
    earnings[targetUserId] = (earnings[targetUserId] || 0) + playerAmount;
    state.data.playerEarnings = earnings;

    broadcastGameEvent(streamId, "gift", {
      senderId: user.id,
      senderName: user.displayName,
      targetUserId,
      targetName: targetPlayer.displayName,
      amount,
      playerAmount,
      hostCutAmount,
    });

    return NextResponse.json({
      success: true,
      playerAmount,
      hostCutAmount,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Transaction failed";
    if (message.includes("Insufficient credits")) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 400 });
    }
    console.error("Gift transaction failed:", error);
    return NextResponse.json({ error: "Gift failed" }, { status: 500 });
  }
}
