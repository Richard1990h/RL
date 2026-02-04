// Server-authoritative Tower Wars logic

import type { GameState, GameAction, TickHandler, GameLogicHandler } from "./game-engine";

interface TowerUnit {
  id: string;
  type: "infantry" | "tank" | "anti_air" | "air" | "support";
  team: "A" | "B";
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  position: number; // 0-100, team A starts at 0, team B at 100
  counters: string[];
}

const UNIT_DEFS: Record<string, { type: TowerUnit["type"]; hp: number; damage: number; speed: number; cost: number; counters: string[] }> = {
  swordsman: { type: "infantry", hp: 50, damage: 10, speed: 2, cost: 5, counters: ["air"] },
  archer: { type: "infantry", hp: 30, damage: 15, speed: 1.5, cost: 10, counters: ["infantry"] },
  knight: { type: "tank", hp: 100, damage: 20, speed: 1, cost: 25, counters: ["infantry"] },
  catapult: { type: "tank", hp: 60, damage: 40, speed: 0.5, cost: 50, counters: ["tank"] },
  dragon: { type: "air", hp: 80, damage: 30, speed: 3, cost: 75, counters: ["infantry", "tank"] },
  ballista: { type: "anti_air", hp: 40, damage: 25, speed: 1, cost: 30, counters: ["air"] },
  healer: { type: "support", hp: 25, damage: 0, speed: 1.5, cost: 20, counters: [] },
  commander: { type: "tank", hp: 200, damage: 50, speed: 0.8, cost: 100, counters: ["infantry", "tank", "air"] },
};

export function createTowerWarsHandlers(): { tick: TickHandler; action: GameLogicHandler } {
  return {
    tick: towerWarsTick,
    action: towerWarsAction,
  };
}

function towerWarsTick(state: GameState, deltaMs: number): GameState {
  if (state.phase !== "active") return state;

  const units = (state.data.units as TowerUnit[]) || [];
  const baseHpA = (state.data.baseHpA as number) ?? 1000;
  const baseHpB = (state.data.baseHpB as number) ?? 1000;
  const dt = deltaMs / 1000;

  // Move units
  for (const unit of units) {
    if (unit.hp <= 0) continue;
    const direction = unit.team === "A" ? 1 : -1;
    unit.position += unit.speed * dt * direction;
  }

  // Combat - units in range attack
  for (let i = 0; i < units.length; i++) {
    const attacker = units[i];
    if (attacker.hp <= 0) continue;

    // Support units heal allies
    if (attacker.type === "support") {
      for (const ally of units) {
        if (ally.team === attacker.team && ally.hp > 0 && ally.hp < ally.maxHp) {
          const dist = Math.abs(ally.position - attacker.position);
          if (dist < 5) {
            ally.hp = Math.min(ally.maxHp, ally.hp + 5 * dt);
          }
        }
      }
      continue;
    }

    // Find closest enemy
    let closestEnemy: TowerUnit | null = null;
    let closestDist = Infinity;

    for (const target of units) {
      if (target.team === attacker.team || target.hp <= 0) continue;
      const dist = Math.abs(target.position - attacker.position);
      if (dist < closestDist) {
        closestDist = dist;
        closestEnemy = target;
      }
    }

    if (closestEnemy && closestDist < 5) {
      // Attack with counter bonus
      let dmg = attacker.damage * dt;
      if (attacker.counters.includes(closestEnemy.type)) {
        dmg *= 1.5; // Counter bonus
      }
      closestEnemy.hp -= dmg;

      // Stop moving when fighting
      continue;
    }
  }

  // Check base damage
  let newBaseHpA = baseHpA;
  let newBaseHpB = baseHpB;

  for (const unit of units) {
    if (unit.hp <= 0) continue;
    if (unit.team === "A" && unit.position >= 95) {
      newBaseHpB -= unit.damage * dt;
    } else if (unit.team === "B" && unit.position <= 5) {
      newBaseHpA -= unit.damage * dt;
    }
  }

  // Remove dead units
  state.data.units = units.filter((u) => u.hp > 0);
  state.data.baseHpA = Math.max(0, newBaseHpA);
  state.data.baseHpB = Math.max(0, newBaseHpB);

  // Countdown
  state.timeRemaining -= deltaMs / 1000;

  // Check win conditions
  if (newBaseHpA <= 0) {
    state.phase = "finished";
    // Team B wins - find team B players, highest score is winner
    const teamB = Object.values(state.players).filter((p) => p.team === "B");
    state.winner = teamB.sort((a, b) => b.score - a.score)[0]?.userId || null;
    state.data.winningTeam = "B";
  } else if (newBaseHpB <= 0) {
    state.phase = "finished";
    const teamA = Object.values(state.players).filter((p) => p.team === "A");
    state.winner = teamA.sort((a, b) => b.score - a.score)[0]?.userId || null;
    state.data.winningTeam = "A";
  } else if (state.timeRemaining <= 0) {
    state.phase = "finished";
    // Higher base HP wins
    if (newBaseHpA > newBaseHpB) {
      const teamA = Object.values(state.players).filter((p) => p.team === "A");
      state.winner = teamA.sort((a, b) => b.score - a.score)[0]?.userId || null;
      state.data.winningTeam = "A";
    } else {
      const teamB = Object.values(state.players).filter((p) => p.team === "B");
      state.winner = teamB.sort((a, b) => b.score - a.score)[0]?.userId || null;
      state.data.winningTeam = "B";
    }
  }

  return state;
}

function towerWarsAction(state: GameState, action: GameAction): GameState {
  const player = state.players[action.userId];
  if (!player || player.isEliminated) return state;

  switch (action.type) {
    case "spawn_unit": {
      const unitType = action.payload.unitType as string;
      const def = UNIT_DEFS[unitType];
      if (!def) break;

      const team = player.team || "A";
      const units = (state.data.units as TowerUnit[]) || [];

      units.push({
        id: `unit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: def.type,
        team,
        hp: def.hp,
        maxHp: def.hp,
        damage: def.damage,
        speed: def.speed,
        position: team === "A" ? 5 : 95,
        counters: def.counters,
      });

      state.data.units = units;
      player.score += def.cost;
      break;
    }
    case "donate": {
      const amount = (action.payload.amount as number) || 0;
      player.score += amount;
      break;
    }
  }

  return state;
}
