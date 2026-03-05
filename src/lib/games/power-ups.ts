/**
 * Power-Up Configuration for Battle System
 *
 * Power-ups are purchasable abilities that affect battles:
 * - BOOSTING_GLOVE: 5x score multiplier for 10 seconds
 * - MAGIC_MIST: Hide opponent's score for 15 seconds
 * - STUN_HAMMER: Visual distortion effect for 5 seconds (cosmetic only)
 * - TIME_MAKER: Add 10 seconds to the battle timer
 */

export type PowerUpType = "BOOSTING_GLOVE" | "MAGIC_MIST" | "STUN_HAMMER" | "TIME_MAKER";

export interface PowerUpConfig {
  type: PowerUpType;
  name: string;
  description: string;
  cost: number;          // Cost in credits
  durationMs: number;    // Duration in milliseconds (0 for instant effects like TIME_MAKER)
  icon: string;          // Lucide icon name
  color: string;         // Hex color for UI
  maxPerBattle?: number; // Optional limit per battle (e.g., TIME_MAKER limited to 5)
  targetType: "opponent" | "self" | "stream"; // Who can be targeted
}

export const POWER_UPS: PowerUpConfig[] = [
  {
    type: "BOOSTING_GLOVE",
    name: "Boosting Glove",
    description: "5x score multiplier for 10 seconds",
    cost: 500,
    durationMs: 10000,
    icon: "Zap",
    color: "#f59e0b",
    targetType: "self",
  },
  {
    type: "MAGIC_MIST",
    name: "Magic Mist",
    description: "Hide opponent's score for 15 seconds",
    cost: 300,
    durationMs: 15000,
    icon: "Cloud",
    color: "#8b5cf6",
    targetType: "opponent",
  },
  {
    type: "STUN_HAMMER",
    name: "Stun Hammer",
    description: "Distort opponent's view for 5 seconds",
    cost: 400,
    durationMs: 5000,
    icon: "Hammer",
    color: "#ef4444",
    targetType: "opponent",
  },
  {
    type: "TIME_MAKER",
    name: "Time Maker",
    description: "Add 10 seconds to the timer",
    cost: 1000,
    durationMs: 0, // Instant effect
    icon: "Clock",
    color: "#10b981",
    maxPerBattle: 5,
    targetType: "stream",
  },
];

// Helper to get power-up config by type
export function getPowerUpConfig(type: PowerUpType): PowerUpConfig | undefined {
  return POWER_UPS.find((p) => p.type === type);
}

// Helper to get power-up cost
export function getPowerUpCost(type: PowerUpType): number {
  return getPowerUpConfig(type)?.cost ?? 0;
}

// Helper to get power-up duration
export function getPowerUpDuration(type: PowerUpType): number {
  return getPowerUpConfig(type)?.durationMs ?? 0;
}

// Interface for active power-up state in game
export interface ActivePowerUp {
  id: string;
  type: PowerUpType;
  userId: string;       // User who purchased
  targetId: string | null; // Target player (null for stream-wide effects)
  activatedAt: number;  // Timestamp when activated
  expiresAt: number | null; // Timestamp when it expires (null for instant effects)
}

// Check if a power-up is currently active for a target
export function isPowerUpActive(
  activePowerUps: ActivePowerUp[],
  type: PowerUpType,
  targetId: string
): boolean {
  const now = Date.now();
  return activePowerUps.some(
    (p) =>
      p.type === type &&
      p.targetId === targetId &&
      (p.expiresAt === null || p.expiresAt > now)
  );
}

// Get all active power-ups for a target
export function getActivePowerUpsForTarget(
  activePowerUps: ActivePowerUp[],
  targetId: string
): ActivePowerUp[] {
  const now = Date.now();
  return activePowerUps.filter(
    (p) =>
      p.targetId === targetId &&
      (p.expiresAt === null || p.expiresAt > now)
  );
}

// Get remaining duration for an active power-up
export function getPowerUpRemainingMs(powerUp: ActivePowerUp): number {
  if (powerUp.expiresAt === null) return 0;
  return Math.max(0, powerUp.expiresAt - Date.now());
}

// Calculate score with power-up multipliers applied
export function applyScoreMultiplier(
  baseScore: number,
  activePowerUps: ActivePowerUp[],
  targetId: string
): number {
  const now = Date.now();

  // Check for BOOSTING_GLOVE
  const hasBoostingGlove = activePowerUps.some(
    (p) =>
      p.type === "BOOSTING_GLOVE" &&
      p.targetId === targetId &&
      p.expiresAt !== null &&
      p.expiresAt > now
  );

  if (hasBoostingGlove) {
    return baseScore * 5;
  }

  return baseScore;
}

// Power-up icon mapping for use with Lucide
export const POWER_UP_ICONS: Record<PowerUpType, string> = {
  BOOSTING_GLOVE: "Zap",
  MAGIC_MIST: "Cloud",
  STUN_HAMMER: "Hammer",
  TIME_MAKER: "Clock",
};

// Power-up sound effects (Web Audio API frequencies)
export const POWER_UP_SOUNDS: Record<PowerUpType, { type: OscillatorType; frequencies: number[] }> = {
  BOOSTING_GLOVE: { type: "sine", frequencies: [440, 554, 659, 880] },
  MAGIC_MIST: { type: "sine", frequencies: [330, 392, 440, 523] },
  STUN_HAMMER: { type: "sawtooth", frequencies: [220, 165, 110] },
  TIME_MAKER: { type: "triangle", frequencies: [523, 659, 784, 1047] },
};

// Play power-up activation sound
export function playPowerUpSound(type: PowerUpType): void {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const now = ctx.currentTime;
    const config = POWER_UP_SOUNDS[type];

    config.frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = config.type;

      const startTime = now + i * 0.08;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

      osc.start(startTime);
      osc.stop(startTime + 0.3);
    });

    setTimeout(() => ctx.close(), 2000);
  } catch {
    // Audio not supported
  }
}
