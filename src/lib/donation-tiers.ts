import type { DonationTier } from "@/lib/types";

/**
 * Shared donation tiers used across video donations and live stream gifts.
 * All values are in credits (1 credit = $0.01).
 * Min: 1 credit, Max: 50,000 credits ($500).
 */
export const DONATION_TIERS: DonationTier[] = [
  // Reactions (1 - 50 credits)
  { id: "wave",    name: "Wave",    valueCents: 1,     iconKey: "👋", rarityColor: "#9ca3af", animationType: "none",      category: "Reactions" },
  { id: "thumbs",  name: "Thumbs",  valueCents: 5,     iconKey: "👍", rarityColor: "#9ca3af", animationType: "none",      category: "Reactions" },
  { id: "clap",    name: "Clap",    valueCents: 10,    iconKey: "👏", rarityColor: "#9ca3af", animationType: "none",      category: "Reactions" },
  { id: "heart",   name: "Heart",   valueCents: 25,    iconKey: "❤️", rarityColor: "#ef4444", animationType: "none",      category: "Reactions" },
  { id: "laugh",   name: "Laugh",   valueCents: 50,    iconKey: "😂", rarityColor: "#fbbf24", animationType: "none",      category: "Reactions" },

  // Standard (100 - 500 credits)
  { id: "fire",    name: "Fire",    valueCents: 100,   iconKey: "🔥", rarityColor: "#f97316", animationType: "sparkle",   category: "Standard" },
  { id: "star",    name: "Star",    valueCents: 250,   iconKey: "⭐", rarityColor: "#eab308", animationType: "sparkle",   category: "Standard" },
  { id: "bolt",    name: "Bolt",    valueCents: 500,   iconKey: "⚡", rarityColor: "#f59e0b", animationType: "sparkle",   category: "Standard" },

  // Premium (1,000 - 5,000 credits)
  { id: "diamond", name: "Diamond", valueCents: 1000,  iconKey: "💎", rarityColor: "#3b82f6", animationType: "sparkle",   category: "Premium" },
  { id: "crown",   name: "Crown",   valueCents: 2500,  iconKey: "👑", rarityColor: "#a855f7", animationType: "explosion", category: "Premium" },
  { id: "rocket",  name: "Rocket",  valueCents: 5000,  iconKey: "🚀", rarityColor: "#ec4899", animationType: "explosion", category: "Premium" },

  // Legendary (10,000 - 50,000 credits) - Full-screen takeover animations
  { id: "trophy",  name: "Trophy",  valueCents: 10000, iconKey: "🏆", rarityColor: "#f59e0b", animationType: "takeover", category: "Legendary" },
  { id: "comet",   name: "Comet",   valueCents: 25000, iconKey: "☄️", rarityColor: "#6366f1", animationType: "takeover", category: "Legendary" },
  { id: "galaxy",  name: "Galaxy",  valueCents: 50000, iconKey: "🌌", rarityColor: "#8b5cf6", animationType: "takeover", category: "Legendary" },
];

/* ============================================================
   TOWER WARS UNIT STATS
   Each donation tier maps to a unit with attack or heal stats.
   ============================================================ */

export interface TowerWarsUnitStats {
  type: "attack" | "heal";
  hp: number;
  damage: number;
  speed: number;
  healAmount: number;
}

export const TOWER_WARS_STATS: Record<string, TowerWarsUnitStats> = {
  wave:    { type: "attack", hp: 5,    damage: 2,   speed: 3,   healAmount: 0 },
  thumbs:  { type: "attack", hp: 10,   damage: 4,   speed: 3,   healAmount: 0 },
  clap:    { type: "attack", hp: 20,   damage: 8,   speed: 2.5, healAmount: 0 },
  heart:   { type: "attack", hp: 35,   damage: 12,  speed: 2,   healAmount: 0 },
  laugh:   { type: "attack", hp: 50,   damage: 18,  speed: 2,   healAmount: 0 },
  fire:    { type: "attack", hp: 80,   damage: 30,  speed: 1.8, healAmount: 0 },
  star:    { type: "heal",   hp: 0,    damage: 0,   speed: 0,   healAmount: 50 },
  bolt:    { type: "heal",   hp: 0,    damage: 0,   speed: 0,   healAmount: 120 },
  diamond: { type: "heal",   hp: 0,    damage: 0,   speed: 0,   healAmount: 250 },
  crown:   { type: "attack", hp: 200,  damage: 80,  speed: 1.5, healAmount: 0 },
  rocket:  { type: "attack", hp: 300,  damage: 150, speed: 2,   healAmount: 0 },
  trophy:  { type: "attack", hp: 500,  damage: 250, speed: 1.5, healAmount: 0 },
  comet:   { type: "attack", hp: 800,  damage: 400, speed: 2.5, healAmount: 0 },
  galaxy:  { type: "attack", hp: 1500, damage: 750, speed: 3,   healAmount: 0 },
};
