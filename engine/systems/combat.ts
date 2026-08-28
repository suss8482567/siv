/**
 * Combat (M3): the SPEC §10 resolution formula, damage to both sides, XP,
 * promotions, healing. Melee and ranged (bombard) both route through here.
 */
import { buildContentDb } from '../../content';
import type { GameEvent } from '../core/events';
import type { GameState, TileId, Unit } from '../core/types';
import { hexDistance } from '../hex/axial';
import { checkDomination, checkEliminations } from './victory';

export const XP_ON_KILL = 5;
export const XP_ON_HIT = 2;
export const HEAL_PER_TURN = 10;
export const HEAL_IN_CITY = 20;

/** Strength of a unit at its current HP (wounded units fight weaker). */
export function effectiveStrength(state: GameState, unit: Unit): number {
  const def = buildContentDb().units[unit.typeId];
  if (!def) return 0;
  const base = def.rangedStrength > 0 ? Math.max(def.strength, 1) : def.strength;
  const hpFactor = 0.5 + 0.5 * (unit.hp / 100);
  let str = base * hpFactor;
  const content = buildContentDb();
  for (const pid of unit.promotions) {
    str += content.promotions[pid]?.strengthBonus ?? 0;
  }
  // Difficulty grants AI-owned units a flat strength edge (SPEC §12).
  const owner = state.players[unit.ownerId];
  if (owner && !owner.isHuman && state.difficulty > 0 && def.unitClass !== 'civilian') {
    str += [0, 1, 2, 3][Math.min(state.difficulty, 3)];
  }
  return str;
}

const DAMAGE_BASE = 30;
const DAMAGE_EXP = 0.045;

function damageForDelta(delta: number, rngValue: number): number {
  const u = 0.8 + 0.4 * rngValue; // deterministic rng fraction in [0.8, 1.2)
  return Math.max(1, Math.round(DAMAGE_BASE * Math.exp(DAMAGE_EXP * delta) * u));
}

/**
 * Damage dealt by `attacker` to `defender` in one round:
 * dmg = round(30 · e^(0.045·Δ) · U(0.8–1.2)), never below 1.
 */
export function damageRoll(state: GameState, attacker: Unit, defender: Unit, rngValue: number): number {
  const delta = effectiveStrength(state, attacker) - effectiveStrength(state, defender);
  return damageForDelta(delta, rngValue);
}

/** Can `attacker` initiate combat vs unit `defender` this instant? */
export function canAttackUnit(state: GameState, attacker: Unit, defender: Unit): boolean {
  if (attacker.attacksLeft <= 0 || attacker.movementLeft <= 0) return false;
  if (attacker.ownerId === defender.ownerId) return false;
  const aDef = buildContentDb().units[attacker.typeId];
  const dTile = state.map.tiles[defender.tileId];
  const aTile = state.map.tiles[attacker.tileId];
  const dist = hexDistance(aTile.q, aTile.r, dTile.q, dTile.r);
  const isRanged = (aDef?.range ?? 0) > 1;
  if (isRanged && (aDef.range ?? 0) >= dist && dist > 1) return true; // bombard
  return dist === 1; // melee adjacency
}

export interface AttackOutcome {
  dmgToDefender: number;
  dmgToAttacker: number;
  attackerDied: boolean;
  defenderDied: boolean;
}

/**
 * One attack round. Melee: both sides deal damage. Ranged (range > 1 and
 * dist in [2..range]): only the defender takes damage, attacker never dies.
 * Kills grant XP; survivors may promote at XP thresholds.
 */
export function resolveAttack(
  state: GameState,
  events: GameEvent[],
  attacker: Unit,
  defender: Unit,
  rngValue: number,
): AttackOutcome {
  const content = buildContentDb();
  const aDef = content.units[attacker.typeId];
  const isRanged = (aDef?.range ?? 0) > 1;
  const dTile = state.map.tiles[defender.tileId];
  const aTile = state.map.tiles[attacker.tileId];
  const dist = hexDistance(aTile.q, aTile.r, dTile.q, dTile.r);

  const dmgToDefender = damageRoll(state, attacker, defender, rngValue);
  let dmgToAttacker = 0;
  if (!isRanged) {
    dmgToAttacker = damageRoll(state, defender, attacker, 1 - rngValue);
  }

  defender.hp = Math.max(0, defender.hp - dmgToDefender);
  attacker.hp = Math.max(0, attacker.hp - dmgToAttacker);
  attacker.attacksLeft = 0;
  if (!isRanged) attacker.movementLeft = 0;

  // Deaths.
  if (defender.hp <= 0 && attacker.hp <= 0) {
    // Mutual death: attacker survives on 1 HP (melee always leaves a winner).
    attacker.hp = 1;
  }
  let defenderDied = false;
  let attackerDied = false;
  if (defender.hp <= 0) {
    defenderDied = true;
    const typeId = defender.typeId;
    delete state.units[defender.id];
    events.push({ kind: 'unitKilled', unitId: defender.id, byPlayerId: attacker.ownerId, unitTypeId: typeId });
    grantXp(state, events, attacker, XP_ON_KILL);
  }
  if (attacker.hp <= 0) {
    attackerDied = true;
    const typeId = attacker.typeId;
    delete state.units[attacker.id];
    events.push({ kind: 'unitKilled', unitId: attacker.id, byPlayerId: defender.ownerId, unitTypeId: typeId });
    grantXp(state, events, defender, XP_ON_KILL);
  }
  // A dead settler may be a player's last chance at a city.
  if (defenderDied || attackerDied) checkEliminations(state, events);
  if (!defenderDied && !attackerDied) {
    grantXp(state, events, attacker, XP_ON_HIT);
    grantXp(state, events, defender, XP_ON_HIT);
  }

  events.push({
    kind: 'combatResolved',
    attackerId: attacker.id,
    defenderUnitId: defender.id,
    dmgToDefender,
    dmgToAttacker,
  });
  return { dmgToDefender, dmgToAttacker, attackerDied, defenderDied };
}

/** XP thresholds: 15/30/60; promotion is chosen automatically (v0). */
const XP_THRESHOLDS = [15, 30, 60];

function grantXp(state: GameState, events: GameEvent[], unit: Unit, amount: number): void {
  const survivor = state.units[unit.id];
  if (!survivor) return;
  survivor.xp += amount;
  const level = promotionsEarned(survivor.xp);
  if (level > survivor.promotions.length && level <= XP_THRESHOLDS.length) {
    const pool = availablePromotions(survivor);
    if (pool.length > 0) {
      const pick = pool[survivor.xp % pool.length];
      survivor.promotions.push(pick);
      events.push({ kind: 'unitPromoted', unitId: survivor.id, promotionId: pick });
    }
  }
}

export function promotionsEarned(xp: number): number {
  let n = 0;
  for (const t of XP_THRESHOLDS) if (xp >= t) n++;
  return n;
}

/** Promotions not yet held by the unit. */
export function availablePromotions(unit: Unit): string[] {
  return Object.keys(buildContentDb().promotions).filter((id) => !unit.promotions.includes(id));
}

/** Start-of-turn healing (units that did not act heal faster — v0 keeps it simple). */
export function healUnits(state: GameState, playerId: number): void {
  for (const unit of Object.values(state.units)) {
    if (unit.ownerId !== playerId || unit.hp >= 100) continue;
    const city = Object.values(state.cities).find((c) => c.ownerId === playerId && c.tileId === unit.tileId);
    const inOwnCity = city !== undefined;
    const amount = inOwnCity ? HEAL_IN_CITY : HEAL_PER_TURN;
    unit.hp = Math.min(100, unit.hp + amount);
  }
}

/** Combat strength of a city center (garrison + size + defensive buildings). */
export function cityDefenseStrength(state: GameState, cityId: number): number {
  const city = state.cities[cityId];
  if (!city) return 0;
  const content = buildContentDb();
  let str = 8 + 2 * city.population;
  for (const bid of city.buildings) str += content.buildings[bid]?.defenseStrength ?? 0;
  const garrison = Object.values(state.units).find((u) => u.tileId === city.tileId && u.ownerId === city.ownerId);
  if (garrison) str += effectiveStrength(state, garrison) / 2;
  return str;
}

/**
 * Attack a city. Ranged attackers bombard from range (no return damage);
 * melee takes return fire. Reducing hp to 0 enables capture by a melee
 * attacker: the same command captures instead of dealing damage.
 */
export function resolveCityAttack(
  state: GameState,
  events: GameEvent[],
  attacker: Unit,
  cityId: number,
  rngValue: number,
): boolean {
  const city = state.cities[cityId];
  if (!city || city.ownerId === attacker.ownerId) return false;
  if (attacker.attacksLeft <= 0) return false;
  const aDef = buildContentDb().units[attacker.typeId];
  const cTile = state.map.tiles[city.tileId];
  const aTile = state.map.tiles[attacker.tileId];
  const dist = hexDistance(aTile.q, aTile.r, cTile.q, cTile.r);
  const isRanged = (aDef?.range ?? 0) > 1;
  if (!isRanged && dist !== 1) return false;
  if (isRanged && dist > (aDef.range ?? 0)) return false;

  const cityStr = cityDefenseStrength(state, cityId);
  // City fights back with its defense strength (ranged bombardment is safe).
  const deltaA = effectiveStrength(state, attacker) - cityStr;
  const u = 0.8 + 0.4 * rngValue;

  if (isRanged) {
    const dmg = damageForDelta(deltaA, rngValue);
    city.hp = Math.max(0, city.hp - dmg);
    attacker.attacksLeft = 0;
    events.push({ kind: 'combatResolved', attackerId: attacker.id, defenderCityId: cityId, dmgToDefender: dmg, dmgToAttacker: 0 });
    return true;
  }

  // Melee exchange.
  const dmgToDefender = damageForDelta(deltaA, rngValue);
  const dmgToAttacker = damageForDelta(-deltaA, 1 - rngValue);
  attacker.attacksLeft = 0;
  attacker.movementLeft = 0;

  if (city.hp <= 0) {
    // Barbarians raid rather than rule: plunder the treasury and withdraw.
    if (state.players[attacker.ownerId]?.civId === 'barbarians') {
      const victim = state.players[city.ownerId];
      const plunder = Math.min(victim?.gold ?? 0, 30 + state.turn);
      if (victim) victim.gold -= plunder;
      city.hp = 10;
      grantXp(state, events, attacker, XP_ON_KILL);
      events.push({ kind: 'combatResolved', attackerId: attacker.id, defenderCityId: cityId, dmgToDefender: 0, dmgToAttacker: 0 });
      return true;
    }
    captureCity(state, events, cityId, attacker);
    grantXp(state, events, attacker, XP_ON_KILL);
    return true;
  }
  city.hp = Math.max(0, city.hp - dmgToDefender);
  attacker.hp = Math.max(0, attacker.hp - dmgToAttacker);
  if (attacker.hp <= 0) {
    const typeId = attacker.typeId;
    delete state.units[attacker.id];
    events.push({ kind: 'unitKilled', unitId: attacker.id, byPlayerId: city.ownerId, unitTypeId: typeId });
  } else {
    grantXp(state, events, attacker, XP_ON_HIT);
  }
  events.push({ kind: 'combatResolved', attackerId: attacker.id, defenderCityId: cityId, dmgToDefender, dmgToAttacker });
  return true;
}

/** Melee takeover of a zero-hp enemy city: owner flip, half population, palace loss. */
export function captureCity(state: GameState, events: GameEvent[], cityId: number, attacker: Unit): void {
  const city = state.cities[cityId];
  if (!city || !attacker) return;
  const prevOwner = city.ownerId;
  city.ownerId = attacker.ownerId;
  // originalOwnerId is immutable — the first founder is tracked for domination via player.originalCapitalCityId
  city.everCaptured = true;
  city.hp = 50;
  city.population = Math.max(1, Math.floor(city.population / 2));
  city.buildings = city.buildings.filter((b) => b !== 'palace');
  city.productionQueue = [];
  city.productionStored = 0;
  // Territory flips with the city; worked-tile assignments reset.
  for (const tid of city.ownedTileIds) {
    state.map.tiles[tid].ownerPlayerId = attacker.ownerId;
  }
  // Captured civilians on the center change hands.
  for (const u of Object.values(state.units)) {
    if (u.tileId === city.tileId && u.ownerId === prevOwner && u.typeId !== 'warrior') {
      u.ownerId = attacker.ownerId;
      u.movementLeft = 0;
    }
  }
  events.push({ kind: 'cityCaptured', cityId, byPlayerId: attacker.ownerId });
  // Losing a last city (or taking the final original capital) can end the game.
  checkEliminations(state, events);
  checkDomination(state, events);
}
