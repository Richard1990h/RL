// Spin Wheel - Donate to spin, physics-based wheel animation, customizable segments

import type { GameState, GameAction, TickHandler, GameLogicHandler } from "./game-engine";

interface WheelSegment {
  id: string;
  label: string;
  color: string;
  multiplier: number; // Points multiplier for this segment
}

const DEFAULT_SEGMENTS: WheelSegment[] = [
  { id: "s1", label: "2x", color: "#8B5CF6", multiplier: 2 },
  { id: "s2", label: "Bankrupt", color: "#EF4444", multiplier: 0 },
  { id: "s3", label: "5x", color: "#10B981", multiplier: 5 },
  { id: "s4", label: "1x", color: "#06B6D4", multiplier: 1 },
  { id: "s5", label: "3x", color: "#F59E0B", multiplier: 3 },
  { id: "s6", label: "10x!", color: "#EC4899", multiplier: 10 },
  { id: "s7", label: "1x", color: "#3B82F6", multiplier: 1 },
  { id: "s8", label: "2x", color: "#8B5CF6", multiplier: 2 },
];

export function createSpinWheelHandlers(): { tick: TickHandler; action: GameLogicHandler } {
  return {
    tick: spinWheelTick,
    action: spinWheelAction,
  };
}

function spinWheelTick(state: GameState, deltaMs: number): GameState {
  if (state.phase !== "active") return state;

  const isSpinning = state.data.isSpinning as boolean;
  if (!isSpinning) return state;

  // Physics: decelerate the wheel
  let angularVelocity = (state.data.angularVelocity as number) || 0;
  const deceleration = 0.98; // Friction coefficient
  const currentAngle = (state.data.currentAngle as number) || 0;

  angularVelocity *= deceleration;
  const newAngle = (currentAngle + angularVelocity * (deltaMs / 1000)) % 360;

  state.data.currentAngle = newAngle;
  state.data.angularVelocity = angularVelocity;

  // Check if wheel has stopped
  if (Math.abs(angularVelocity) < 0.5) {
    state.data.isSpinning = false;
    state.data.angularVelocity = 0;

    // Determine which segment was landed on
    const segments = (state.data.segments as WheelSegment[]) || DEFAULT_SEGMENTS;
    const segmentAngle = 360 / segments.length;
    const normalizedAngle = ((360 - newAngle) % 360 + 360) % 360;
    const segmentIndex = Math.floor(normalizedAngle / segmentAngle);
    const segment = segments[segmentIndex % segments.length];

    state.data.landedSegment = segment;
    state.data.resultTimer = 3; // Show result for 3 seconds

    // Apply multiplier to the spinner's donation
    const spinnerId = state.data.currentSpinner as string;
    const spinAmount = (state.data.currentSpinAmount as number) || 0;

    if (spinnerId && state.players[spinnerId]) {
      const points = Math.floor(spinAmount * segment.multiplier);
      state.players[spinnerId].score += points;
      state.data.lastWinAmount = points;
    }

    state.round++;
  }

  // Result display countdown
  const resultTimer = state.data.resultTimer as number;
  if (resultTimer > 0 && !isSpinning) {
    state.data.resultTimer = resultTimer - deltaMs / 1000;
    if (resultTimer - deltaMs / 1000 <= 0) {
      state.data.resultTimer = 0;
      state.data.landedSegment = null;
      state.data.currentSpinner = null;
    }
  }

  // Game time limit
  state.timeRemaining -= deltaMs / 1000;
  if (state.timeRemaining <= 0) {
    state.phase = "finished";
    const sorted = Object.values(state.players).sort((a, b) => b.score - a.score);
    state.winner = sorted[0]?.userId || null;
  }

  return state;
}

function spinWheelAction(state: GameState, action: GameAction): GameState {
  const player = state.players[action.userId];
  if (!player || player.isEliminated) return state;

  switch (action.type) {
    case "configure_wheel": {
      state.data.segments = action.payload.segments || DEFAULT_SEGMENTS;
      break;
    }
    case "spin":
    case "donate": {
      const isSpinning = state.data.isSpinning as boolean;
      if (isSpinning) break; // Can't spin while already spinning

      const amount = (action.payload.amount as number) || 0;
      if (amount < 1) break;

      // Start the spin
      state.data.isSpinning = true;
      state.data.currentSpinner = action.userId;
      state.data.currentSpinAmount = amount;

      // Random initial velocity (higher donations = faster initial spin)
      const baseVelocity = 300 + Math.random() * 200;
      const donationBonus = Math.min(amount * 2, 200);
      state.data.angularVelocity = baseVelocity + donationBonus;

      if (!state.data.segments) {
        state.data.segments = DEFAULT_SEGMENTS;
      }
      break;
    }
  }

  return state;
}
