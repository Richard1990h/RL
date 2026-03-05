// Server-authoritative Timer Wars logic with TikTok Battle Parity features

import type { GameState, GameAction, TickHandler, GameLogicHandler } from "./game-engine";
import type { ActivePowerUp, PowerUpType } from "./power-ups";
import { getPowerUpDuration, applyScoreMultiplier } from "./power-ups";

// Extended GameState.data types for Timer Wars
interface TimerWarsData {
  roundTimeSec?: number;
  roundStartScores?: Record<string, number>;
  lastEliminated?: string | string[];
  eliminationReason?: string;
  rejoinQueue?: string[];
  // Power-up state
  activePowerUps?: ActivePowerUp[];
  timeExtensionsUsed?: number;
  maxTimeExtensions?: number;
  // Victory lap state
  victoryLapEndsAt?: number;
  winnerId?: string;
  // Top gifters tracking
  topGifters?: Array<{ userId: string; total: number }>;
  gifterTotals?: Record<string, number>;
  // Team battle state
  teamMode?: boolean;
  teamScores?: { A: number; B: number };
  // Specific-gift mode
  scoringGiftTiers?: string[] | null;
}

export function createTimerWarsHandlers(): { tick: TickHandler; action: GameLogicHandler } {
  return {
    tick: timerWarsTick,
    action: timerWarsAction,
  };
}

function timerWarsTick(state: GameState, deltaMs: number): GameState {
  const data = state.data as TimerWarsData;

  // Handle victory lap phase
  if (state.phase === "finished" && data.victoryLapEndsAt) {
    if (Date.now() >= data.victoryLapEndsAt) {
      // Victory lap ended - ready for next battle
      data.victoryLapEndsAt = undefined;
      data.winnerId = undefined;
    }
    return state;
  }

  if (state.phase !== "active") return state;

  // Clean up expired power-ups
  if (data.activePowerUps) {
    const now = Date.now();
    data.activePowerUps = data.activePowerUps.filter(
      (p) => p.expiresAt === null || p.expiresAt > now
    );
  }

  // Calculate team scores if team mode is enabled
  if (data.teamMode) {
    const teamAScore = Object.values(state.players)
      .filter((p) => p.team === "A" && !p.isEliminated)
      .reduce((sum, p) => sum + p.score, 0);
    const teamBScore = Object.values(state.players)
      .filter((p) => p.team === "B" && !p.isEliminated)
      .reduce((sum, p) => sum + p.score, 0);
    data.teamScores = { A: teamAScore, B: teamBScore };
  }

  // Countdown
  state.timeRemaining -= deltaMs / 1000;

  if (state.timeRemaining <= 0) {
    state.timeRemaining = 0;

    // End of round - eliminate lowest scorer
    const activePlayers = Object.values(state.players).filter((p) => !p.isEliminated);

    if (activePlayers.length > 1) {
      // Find lowest scorer
      const sorted = [...activePlayers].sort((a, b) => a.score - b.score);
      const lowest = sorted[0];

      // Check for ties at the bottom
      const tiedAtBottom = sorted.filter((p) => p.score === lowest.score);

      if (tiedAtBottom.length === activePlayers.length) {
        // Everyone tied - sudden death: random elimination
        const eliminated = tiedAtBottom[Math.floor(Math.random() * tiedAtBottom.length)];
        state.players[eliminated.userId].isEliminated = true;
        state.data.lastEliminated = eliminated.userId;
        state.data.eliminationReason = "sudden_death";
      } else {
        // Eliminate all tied at bottom
        for (const player of tiedAtBottom) {
          state.players[player.userId].isEliminated = true;
        }
        state.data.lastEliminated = tiedAtBottom.map((p) => p.userId);
        state.data.eliminationReason = "lowest_score";
      }

      // Check if game is over
      const remaining = Object.values(state.players).filter((p) => !p.isEliminated);
      if (remaining.length <= 1) {
        state.phase = "finished";
        state.winner = remaining[0]?.userId || null;
        computeRankings(state);
        return state;
      }

      // Next round
      state.round++;
      if (state.round > state.maxRounds) {
        // Final - highest score wins
        const winner = remaining.sort((a, b) => b.score - a.score)[0];
        state.phase = "finished";
        state.winner = winner.userId;
        computeRankings(state);
        return state;
      }

      // Reset timer for next round
      state.timeRemaining = (state.data.roundTimeSec as number) || 60;
      // Reset round scores but keep total
      state.data.roundStartScores = Object.fromEntries(
        Object.entries(state.players).map(([id, p]) => [id, p.score])
      );
    } else {
      // Only one player left
      state.phase = "finished";
      state.winner = activePlayers[0]?.userId || null;
      // Start victory lap (3 minutes)
      data.victoryLapEndsAt = Date.now() + 180000;
      data.winnerId = state.winner || undefined;
    }
  }

  // Compute live rankings
  computeRankings(state);

  // Update top gifters
  updateTopGifters(state);

  return state;
}

function updateTopGifters(state: GameState) {
  const data = state.data as TimerWarsData;
  if (!data.gifterTotals) return;

  const gifters = Object.entries(data.gifterTotals)
    .map(([userId, total]) => ({ userId, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  data.topGifters = gifters;
}

function computeRankings(state: GameState) {
  const activePlayers = Object.values(state.players).filter((p) => !p.isEliminated);
  const sorted = [...activePlayers].sort((a, b) => b.score - a.score);
  sorted.forEach((p, idx) => {
    state.players[p.userId].data.rank = idx + 1;
  });
}

function timerWarsAction(state: GameState, action: GameAction): GameState {
  const data = state.data as TimerWarsData;

  // Initialize data structures if needed
  if (!data.activePowerUps) data.activePowerUps = [];
  if (!data.gifterTotals) data.gifterTotals = {};
  if (!data.timeExtensionsUsed) data.timeExtensionsUsed = 0;
  if (!data.maxTimeExtensions) data.maxTimeExtensions = 5;

  // rejoin_queue works for any player (even eliminated) and any phase
  if (action.type === "rejoin_queue") {
    const queue = data.rejoinQueue || [];
    if (!queue.includes(action.userId)) queue.push(action.userId);
    data.rejoinQueue = queue;
    return state;
  }

  // Power-up activation
  if (action.type === "power_up") {
    const { type, targetId } = action.payload as { type: PowerUpType; targetId?: string };
    const duration = getPowerUpDuration(type);
    const now = Date.now();

    // Handle TIME_MAKER specially - adds time to timer
    if (type === "TIME_MAKER") {
      if (data.timeExtensionsUsed >= data.maxTimeExtensions) {
        // Max extensions reached
        return state;
      }
      state.timeRemaining += 10; // Add 10 seconds
      data.timeExtensionsUsed++;

      // Store as instant power-up (no duration)
      const powerUp: ActivePowerUp = {
        id: `${type}-${now}`,
        type,
        userId: action.userId,
        targetId: null,
        activatedAt: now,
        expiresAt: null,
      };
      data.activePowerUps.push(powerUp);
    } else {
      // Duration-based power-ups
      const powerUp: ActivePowerUp = {
        id: `${type}-${now}`,
        type,
        userId: action.userId,
        targetId: targetId || null,
        activatedAt: now,
        expiresAt: now + duration,
      };
      data.activePowerUps.push(powerUp);
    }

    return state;
  }

  const player = state.players[action.userId];
  if (!player || player.isEliminated) return state;

  switch (action.type) {
    case "donate": {
      const amount = (action.payload.amount as number) || 0;
      player.score += amount;
      break;
    }
    case "gift": {
      // Real credit gift - amount is the player's share (after host cut)
      let amount = (action.payload.amount as number) || 0;
      const targetId = (action.payload.targetId as string) || action.userId;
      const tierId = action.payload.tierId as string | undefined;
      const senderId = action.payload.senderId as string | undefined;

      // Check specific-gift mode - if enabled, only certain tiers count
      if (data.scoringGiftTiers && data.scoringGiftTiers.length > 0 && tierId) {
        if (!data.scoringGiftTiers.includes(tierId)) {
          // Gift doesn't count for score (still recorded, just no points)
          // Track gifter totals even for non-scoring gifts
          if (senderId) {
            data.gifterTotals[senderId] = (data.gifterTotals[senderId] || 0) + amount;
          }
          return state;
        }
      }

      // Check for BOOSTING_GLOVE multiplier on the target
      const activePowerUps = data.activePowerUps || [];
      amount = applyScoreMultiplier(amount, activePowerUps, targetId);

      // Apply score to target player
      const targetPlayer = state.players[targetId];
      if (targetPlayer && !targetPlayer.isEliminated) {
        targetPlayer.score += amount;
      }

      // Track gifter totals for leaderboard
      if (senderId) {
        data.gifterTotals[senderId] = (data.gifterTotals[senderId] || 0) + (action.payload.amount as number || 0);
      }
      break;
    }
    case "boost": {
      const boostAmount = (action.payload.amount as number) || 1;
      player.score += boostAmount;
      break;
    }
  }

  return state;
}
