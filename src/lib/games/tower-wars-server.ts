// Server-authoritative Tower Wars logic — Free-For-All with star/hub map

import type { GameState, GameAction, TickHandler, GameLogicHandler } from "./game-engine";

interface TowerUnit {
  id: number;
  tierId: string;
  iconKey: string;
  senderId: string;
  supportingId: string; // whose army
  targetId: string;     // whose base to attack
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  position: number; // 0 = origin base, 50 = center, 100 = target base
}

export function createTowerWarsHandlers(): { tick: TickHandler; action: GameLogicHandler } {
  return {
    tick: towerWarsTick,
    action: towerWarsAction,
  };
}

function towerWarsTick(state: GameState, deltaMs: number): GameState {
  if (state.phase !== "active") return state;

  const units = (state.data.units as TowerUnit[]) || [];
  const baseHp = (state.data.baseHp as Record<string, number>) || {};
  const v1SingleTower = Boolean(state.data.v1SingleTower);
  const objectiveTowerOwnerId = String(state.data.objectiveTowerOwnerId || "");
  const maxBaseHp = (state.data.maxBaseHp as number) || 1000;
  const dt = deltaMs / 1000;
  const moveScale = 10; // scale factor so units cross in ~5-10s

  // Move all units
  for (const unit of units) {
    if (unit.hp <= 0) continue;
    unit.position += unit.speed * dt * moveScale;
  }

  // Combat in center zone (position 40-60)
  // Units from different armies that overlap fight each other
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    if (a.hp <= 0) continue;
    if (a.position < 40 || a.position > 60) continue;

    for (let j = i + 1; j < units.length; j++) {
      const b = units[j];
      if (b.hp <= 0) continue;
      if (b.position < 40 || b.position > 60) continue;
      // Only fight if different armies
      if (a.supportingId === b.supportingId) continue;
      // Check proximity
      if (Math.abs(a.position - b.position) > 5) continue;

      // Mutual damage
      a.hp -= b.damage * dt;
      b.hp -= a.damage * dt;
    }
  }

  // Base damage: units reaching position >= 100 deal damage to target
  for (const unit of units) {
    if (unit.hp <= 0) continue;
    if (unit.position >= 100) {
      const targetId = v1SingleTower ? objectiveTowerOwnerId : unit.targetId;
      if (baseHp[targetId] !== undefined && baseHp[targetId] > 0) {
        baseHp[targetId] = Math.max(0, baseHp[targetId] - unit.damage);
      }
      unit.hp = 0; // consumed
    }
  }

  // Remove dead units
  state.data.units = units.filter((u) => u.hp > 0);

  // V1 tower wars: single objective tower. End immediately when destroyed.
  if (v1SingleTower && objectiveTowerOwnerId) {
    if ((baseHp[objectiveTowerOwnerId] ?? maxBaseHp) <= 0) {
      state.phase = "finished";
      const sorted = Object.values(state.players)
        .sort((a, b) => b.score - a.score);
      state.winner = sorted[0]?.userId || null;
      state.data.baseHp = baseHp;
      return state;
    }
    state.data.baseHp = baseHp;
    return state;
  }

  // Legacy elimination check
  const newlyEliminated: string[] = [];
  for (const [userId, hp] of Object.entries(baseHp)) {
    const player = state.players[userId];
    if (!player || player.isEliminated) continue;
    if (hp <= 0) {
      player.isEliminated = true;
      newlyEliminated.push(userId);
      // Remove all units targeting or from this player
      state.data.units = (state.data.units as TowerUnit[]).filter(
        (u) => u.supportingId !== userId && u.targetId !== userId
      );
    }
  }

  if (newlyEliminated.length > 0) {
    state.data.lastEliminated = newlyEliminated;
  }

  // Win check: if only 1 active player remains
  const activePlayers = Object.values(state.players).filter((p) => !p.isEliminated);
  if (activePlayers.length <= 1 && Object.keys(state.players).length > 1) {
    state.phase = "finished";
    state.winner = activePlayers[0]?.userId || null;
  }

  state.data.baseHp = baseHp;
  return state;
}

function towerWarsAction(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "spawn_unit": {
      const p = action.payload;
      const units = (state.data.units as TowerUnit[]) || [];
      const nextId = ((state.data.nextUnitId as number) || 1);
      const objectiveTowerOwnerId = String(state.data.objectiveTowerOwnerId || "");
      const v1SingleTower = Boolean(state.data.v1SingleTower);
      const resolvedTargetId = v1SingleTower ? objectiveTowerOwnerId : (p.targetId as string);

      units.push({
        id: nextId,
        tierId: p.tierId as string,
        iconKey: p.iconKey as string,
        senderId: action.userId,
        supportingId: p.supportingId as string,
        targetId: resolvedTargetId,
        hp: p.hp as number,
        maxHp: p.maxHp as number,
        damage: p.damage as number,
        speed: p.speed as number,
        position: 0,
      });

      state.data.units = units;
      state.data.nextUnitId = nextId + 1;

      // Track score for the supporting player
      const supportPlayer = state.players[p.supportingId as string];
      if (supportPlayer) {
        supportPlayer.score += (p.damage as number) || 0;
      }
      break;
    }
    case "heal": {
      const targetId = action.payload.targetId as string;
      const healAmount = action.payload.healAmount as number;
      const baseHp = (state.data.baseHp as Record<string, number>) || {};
      const maxBaseHp = (state.data.maxBaseHp as number) || 1000;

      if (baseHp[targetId] !== undefined) {
        baseHp[targetId] = Math.min(maxBaseHp, baseHp[targetId] + healAmount);
        state.data.baseHp = baseHp;
      }

      // Track heal as score for the target player
      const targetPlayer = state.players[targetId];
      if (targetPlayer) {
        targetPlayer.score += healAmount;
      }
      break;
    }
  }

  return state;
}
