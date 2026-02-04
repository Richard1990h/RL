// Server-authoritative Timer Wars logic

import type { GameState, GameAction, TickHandler, GameLogicHandler } from "./game-engine";

export function createTimerWarsHandlers(): { tick: TickHandler; action: GameLogicHandler } {
  return {
    tick: timerWarsTick,
    action: timerWarsAction,
  };
}

function timerWarsTick(state: GameState, deltaMs: number): GameState {
  if (state.phase !== "active") return state;

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
        return state;
      }

      // Next round
      state.round++;
      if (state.round > state.maxRounds) {
        // Final - highest score wins
        const winner = remaining.sort((a, b) => b.score - a.score)[0];
        state.phase = "finished";
        state.winner = winner.userId;
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
    }
  }

  return state;
}

function timerWarsAction(state: GameState, action: GameAction): GameState {
  const player = state.players[action.userId];
  if (!player || player.isEliminated) return state;

  switch (action.type) {
    case "donate": {
      // Donations add to score
      const amount = (action.payload.amount as number) || 0;
      player.score += amount;
      break;
    }
    case "boost": {
      // Special boost action
      const boostAmount = (action.payload.amount as number) || 1;
      player.score += boostAmount;
      break;
    }
  }

  return state;
}
