// Last One Standing - Random elimination every 30s, donate for immunity, last survivor wins pot

import type { GameState, GameAction, TickHandler, GameLogicHandler } from "./game-engine";

const ELIMINATION_INTERVAL_SEC = 30;
const IMMUNITY_COST = 50; // Credits for immunity from one elimination round

export function createLastStandingHandlers(): { tick: TickHandler; action: GameLogicHandler } {
  return {
    tick: lastStandingTick,
    action: lastStandingAction,
  };
}

function lastStandingTick(state: GameState, deltaMs: number): GameState {
  if (state.phase !== "active") return state;

  state.timeRemaining -= deltaMs / 1000;

  // Elimination timer
  const eliminationTimer = (state.data.eliminationTimer as number) ?? ELIMINATION_INTERVAL_SEC;
  const newTimer = eliminationTimer - deltaMs / 1000;
  state.data.eliminationTimer = newTimer;

  if (newTimer <= 0) {
    // Time for an elimination!
    const activePlayers = Object.values(state.players).filter((p) => !p.isEliminated);
    const immunePlayers = (state.data.immunePlayers as string[]) || [];

    // Filter out immune players
    const vulnerable = activePlayers.filter((p) => !immunePlayers.includes(p.userId));

    if (vulnerable.length > 0) {
      // Random elimination from vulnerable players
      const victim = vulnerable[Math.floor(Math.random() * vulnerable.length)];
      state.players[victim.userId].isEliminated = true;
      state.data.lastEliminated = victim.userId;
      state.data.eliminationFlash = true;
      state.round++;

      // Add eliminated player's score to the pot
      const pot = (state.data.pot as number) || 0;
      state.data.pot = pot + victim.score;
    } else if (activePlayers.length > 0) {
      // Everyone is immune - no elimination, just clear immunity
    }

    // Clear immunity for next round
    state.data.immunePlayers = [];
    state.data.eliminationTimer = ELIMINATION_INTERVAL_SEC;

    // Flash timer
    state.data.flashTimer = 2;

    // Check win condition
    const remaining = Object.values(state.players).filter((p) => !p.isEliminated);
    if (remaining.length <= 1) {
      state.phase = "finished";
      state.winner = remaining[0]?.userId || null;
      // Winner gets the pot
      if (state.winner && state.players[state.winner]) {
        state.players[state.winner].score += (state.data.pot as number) || 0;
      }
    }
  }

  // Elimination flash timer
  const flashTimer = state.data.flashTimer as number;
  if (flashTimer > 0) {
    state.data.flashTimer = flashTimer - deltaMs / 1000;
    if (flashTimer - deltaMs / 1000 <= 0) {
      state.data.eliminationFlash = false;
      state.data.flashTimer = 0;
    }
  }

  // Warning when elimination is near
  state.data.eliminationWarning = (state.data.eliminationTimer as number) <= 5;

  return state;
}

function lastStandingAction(state: GameState, action: GameAction): GameState {
  const player = state.players[action.userId];
  if (!player || player.isEliminated) return state;

  switch (action.type) {
    case "buy_immunity": {
      const cost = (action.payload.cost as number) || IMMUNITY_COST;
      const immunePlayers = (state.data.immunePlayers as string[]) || [];

      if (immunePlayers.includes(action.userId)) break; // Already immune

      immunePlayers.push(action.userId);
      state.data.immunePlayers = immunePlayers;
      player.data.immunityUsed = ((player.data.immunityUsed as number) || 0) + 1;

      // Add to pot
      const pot = (state.data.pot as number) || 0;
      state.data.pot = pot + cost;
      break;
    }
    case "donate": {
      const amount = (action.payload.amount as number) || 0;
      player.score += amount;

      // Add to pot
      const pot = (state.data.pot as number) || 0;
      state.data.pot = pot + amount;
      break;
    }
  }

  return state;
}
