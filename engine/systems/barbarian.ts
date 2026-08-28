/**
 * Barbarians (M3, GAME_DESIGN §9): camps seeded away from civs at generation,
 * guards that raid nearby targets with a deterministic FSM (guard → raid →
 * return), raider/camp spawning that scales with turn, and camp-clear gold.
 * The phase runs after the last real player's turn (SPEC §8).
 */
import { buildContentDb } from '../../content';
import type { GameEvent } from '../core/events';
import { nextRngFraction } from '../core/rng';
import type { BarbarianCamp, GameState, PlayerId, TileId, Unit, UnitId } from '../core/types';
import { hexDistance, tileIndex, tilesInRange } from '../hex/axial';
import { canAttackUnit, resolveAttack, resolveCityAttack } from './combat';
import { enterCostFor, executeMove, findUnitPath } from './movement';
import { scoreStartTile } from '../mapgen/populate';

export const BARBARIAN_CIV_ID = 'barbarians';
const RAID_RADIUS = 6;
const RAIDER_SPAWN_EVERY = 5; // turns per camp
const NEW_CAMP_EVERY = 14; // turns
const CAMP_CLEAR_GOLD = 40;

/** Id of the barbarian pseudo-player, or -1 when barbarians are absent. */
export function barbarianPlayerId(state: GameState): PlayerId {
  const p = state.players.find((pl) => pl.civId === BARBARIAN_CIV_ID);
  return p ? p.id : -1;
}

/** Pick camp sites: decent land, >=4 from every start, >=3 from each other. */
export function chooseCampSites(
  tiles: { q: number; r: number; terrain: string; elevation: string; id: number }[],
  width: number,
  heightRows: number,
  starts: number[],
  count: number,
): number[] {
  const eligible = tiles.filter(
    (t) =>
      t.terrain !== 'ocean' &&
      t.terrain !== 'coast' &&
      t.elevation !== 'mountain',
  );
  const scored = eligible
    .map((t) => ({ id: t.id, score: scoreStartTile(tiles as never, t.id, width, heightRows) }))
    .sort((a, b) => b.score - a.score || a.id - b.id);
  const sites: number[] = [];
  for (const cand of scored) {
    if (sites.length === count) break;
    const c = tiles[cand.id];
    const farFromStarts = starts.every((s) => hexDistance(tiles[s].q, tiles[s].r, c.q, c.r) >= 4);
    const farFromCamps = sites.every((s) => hexDistance(tiles[s].q, tiles[s].r, c.q, c.r) >= 3);
    if (farFromStarts && farFromCamps) sites.push(cand.id);
  }
  return sites;
}

/** Spawn one unit for a camp (guard or raider), preferring the camp tile. */
export function spawnCampUnit(
  state: GameState,
  camp: BarbarianCamp,
  typeId: string,
): UnitId | null {
  const def = buildContentDb().units[typeId];
  if (!def) return null;
  const center = state.map.tiles[camp.tileId];
  let site = camp.tileId;
  const occupied = new Set(Object.values(state.units).map((u) => u.tileId));
  if (occupied.has(site)) {
    let found = -1;
    for (const t of tilesInRange(center.q, center.r, 1)) {
      const idx = tileIndex(t.q, t.r, state.map.width, state.map.height);
      if (idx < 0 || occupied.has(idx)) continue;
      const tile = state.map.tiles[idx];
      if (tile.terrain === 'ocean' || tile.terrain === 'coast' || tile.elevation === 'mountain') continue;
      found = idx;
      break;
    }
    if (found < 0) return null;
    site = found;
  }
  const unit: Unit = {
    id: state.nextUnitId++,
    typeId,
    ownerId: barbarianPlayerId(state),
    tileId: site,
    hp: 100,
    movementLeft: 0,
    attacksLeft: 0,
    fortified: false,
    slept: false,
    xp: 0,
    promotions: [],
  };
  state.units[unit.id] = unit;
  camp.unitIds.push(unit.id);
  return unit.id;
}

/** The whole barbarian turn: refresh, spawn, then FSM per unit. */
export function runBarbarianPhase(state: GameState, events: GameEvent[]): void {
  const bid = barbarianPlayerId(state);
  if (bid < 0 || !state.players[bid].alive) return;

  for (const unit of Object.values(state.units)) {
    if (unit.ownerId !== bid) continue;
    const def = buildContentDb().units[unit.typeId];
    unit.movementLeft = def?.moves ?? 2;
    unit.attacksLeft = 1;
  }

  spawnTick(state);
  if (state.turn % NEW_CAMP_EVERY === 0) tryNewCamp(state);

  // Snapshot: combat may delete units mid-loop.
  const roster = Object.values(state.units).filter((u) => u.ownerId === bid);
  for (const unit of roster) {
    if (!state.units[unit.id]) continue; // died earlier this phase
    actForUnit(state, events, state.units[unit.id]);
  }
  checkCampsCleared(state, events); // guards dying on city walls clear camps too
}

/** Raiders trickle out of each camp as the game ages, capped by map area. */
const RAIDER_GRACE_TURNS = 8;

function spawnTick(state: GameState): void {
  // Early-game grace: civs get to found and garrison before raids begin.
  if (state.turn < RAIDER_GRACE_TURNS) return;
  if (state.turn % RAIDER_SPAWN_EVERY !== 0) return;
  const cap = Math.max(2, Math.floor((state.map.width * state.map.height) / 45));
  let alive = Object.values(state.units).filter((u) => u.ownerId === barbarianPlayerId(state)).length;
  if (alive >= cap) return;
  for (const camp of state.barbarianCamps) {
    if (alive >= cap) break;
    const roll = nextRngFraction(state);
    const spawned = spawnCampUnit(state, camp, roll < 0.3 ? 'archer' : 'warrior');
    if (spawned !== null) alive += 1;
  }
}

/** A fresh camp appears somewhere far from the civs. */
function tryNewCamp(state: GameState): void {
  const maxCamps = Math.max(4, Math.min(12, Math.round((state.map.width * state.map.height) / 150)));
  if (state.barbarianCamps.length >= maxCamps) return;
  const cityTiles = Object.values(state.cities).map((c) => c.tileId);
  const candidates: number[] = [];
  for (const tile of state.map.tiles) {
    if (tile.terrain === 'ocean' || tile.terrain === 'coast' || tile.elevation === 'mountain') continue;
    if (tile.ownerPlayerId !== undefined) continue;
    if (Object.values(state.units).some((u) => u.tileId === tile.id)) continue;
    const farFromCities = cityTiles.every((ct) => hexDistance(tile.q, tile.r, state.map.tiles[ct].q, state.map.tiles[ct].r) >= 4);
    const farFromCamps = state.barbarianCamps.every((camp) => {
      const t = state.map.tiles[camp.tileId];
      return hexDistance(tile.q, tile.r, t.q, t.r) >= 3;
    });
    if (farFromCities && farFromCamps) candidates.push(tile.id);
  }
  if (candidates.length === 0) return;
  const pick = candidates[Math.floor(nextRngFraction(state) * candidates.length)];
  const camp: BarbarianCamp = { tileId: pick, unitIds: [] };
  state.barbarianCamps.push(camp);
  spawnCampUnit(state, camp, 'warrior');
}

/** FSM step for one barbarian unit: attack in range, else raid, else go home. */
function actForUnit(state: GameState, events: GameEvent[], unit: Unit): void {
  const home = campOfUnit(state, unit.id);
  if (home && unit.tileId === home.tileId) {
    // Camp guards hold their ground: strike whatever steps into reach,
    // never abandoning the camp to zerg across the map (v0 playtest fix).
    tryAttack(state, events, unit);
    return;
  }
  if (tryAttack(state, events, unit)) return;
  const target = nearestTarget(state, unit);
  if (target) {
    approach(state, events, unit, target.tileId);
    tryAttack(state, events, unit);
    return;
  }
  // Nothing to raid: drift back to the home camp.
  const camp = campOfUnit(state, unit.id);
  if (camp && unit.tileId !== camp.tileId) {
    approach(state, events, unit, camp.tileId);
  }
}

/** Attack the best target currently in weapon range. True when one resolved. */
function tryAttack(state: GameState, events: GameEvent[], unit: Unit): boolean {
  const candidates = Object.values(state.units)
    .filter((u) => u.ownerId !== unit.ownerId && canAttackUnit(state, unit, u))
    .sort((a, b) => a.hp - b.hp || a.id - b.id);
  const victim = candidates[0];
  if (victim) {
    const roll = nextRngFraction(state);
    resolveAttack(state, events, unit, victim, roll);
    return true;
  }
  // Melee at a city whose hp is already zero captures/raids by walking in.
  // Only roll RNG if there's actually a city in range.
  const citiesInRange = Object.values(state.cities)
    .filter((city) => city.ownerId !== unit.ownerId)
    .sort((a, b) => a.id - b.id)
    .filter((city) => {
      const aDef = buildContentDb().units[unit.typeId];
      const cTile = state.map.tiles[city.tileId];
      const aTile = state.map.tiles[unit.tileId];
      if (!cTile || !aTile) return false;
      const dist = hexDistance(aTile.q, aTile.r, cTile.q, cTile.r);
      const isRanged = (aDef?.range ?? 0) > 1;
      if (!isRanged) return dist === 1;
      return dist <= (aDef.range ?? 0) && dist > 0;
    });
  for (const city of citiesInRange) {
    const roll = nextRngFraction(state);
    if (resolveCityAttack(state, events, unit, city.id, roll)) return true;
  }
  return false;
}

interface Target { tileId: TileId; dist: number }

/** Nearest raid-worthy thing within RAID_RADIUS: units first, then cities. */
function nearestTarget(state: GameState, unit: Unit): Target | null {
  const from = state.map.tiles[unit.tileId];
  let best: Target | null = null;
  let bestKind = 3; // 1 military, 2 civilian, 3 city
  for (const other of Object.values(state.units)) {
    if (other.ownerId === unit.ownerId) continue;
    const t = state.map.tiles[other.tileId];
    const dist = hexDistance(from.q, from.r, t.q, t.r);
    if (dist === 0 || dist > RAID_RADIUS) continue;
    const def = buildContentDb().units[other.typeId];
    const kind = def?.unitClass === 'civilian' ? 2 : 1;
    if (kind < bestKind || (kind === bestKind && (!best || dist < best.dist))) {
      best = { tileId: other.tileId, dist };
      bestKind = kind;
    }
  }
  if (best) return best;
  for (const city of Object.values(state.cities)) {
    const t = state.map.tiles[city.tileId];
    const dist = hexDistance(from.q, from.r, t.q, t.r);
    if (dist === 0 || dist > RAID_RADIUS) continue;
    if (best === null || dist < best.dist) {
      best = { tileId: city.tileId, dist };
      bestKind = 3;
    }
  }
  return best;
}

/** Path one step-chain toward a goal tile (stops on ZOC/MP like any move). */
function approach(state: GameState, events: GameEvent[], unit: Unit, goalTileId: TileId): void {
  const path = approachPath(state, unit, goalTileId);
  if (path && path.length > 1) executeMove(state, events, unit, path);
}

/**
 * findUnitPath refuses destinations occupied by anyone, so to reach a target
 * we path to the best adjacent free tile instead.
 */
function approachPath(state: GameState, unit: Unit, goalTileId: TileId): number[] | null {
  const direct = findUnitPath(state, unit, goalTileId);
  if (direct) return direct;
  const goal = state.map.tiles[goalTileId];
  if (!goal) return null;
  const from = state.map.tiles[unit.tileId];
  const options = tilesInRange(goal.q, goal.r, 1)
    .map((t) => tileIndex(t.q, t.r, state.map.width, state.map.height))
    .filter((idx) => idx >= 0 && idx !== unit.tileId)
    .filter((idx) => enterCostFor(state, unit, idx) !== Infinity)
    .filter((idx) => !Object.values(state.units).some((u) => u.tileId === idx))
    .sort(
      (a, b) =>
        hexDistance(from.q, from.r, state.map.tiles[a].q, state.map.tiles[a].r) -
          hexDistance(from.q, from.r, state.map.tiles[b].q, state.map.tiles[b].r) || a - b,
    );
  for (const opt of options) {
    const path = findUnitPath(state, unit, opt);
    if (path) return path;
  }
  return null;
}

function campOfUnit(state: GameState, unitId: UnitId): BarbarianCamp | undefined {
  return state.barbarianCamps.find((c) => c.unitIds.includes(unitId));
}

/**
 * After combat in a dispatch: camps whose units are all dead vanish and the
 * clearer pockets the gold (GAME_DESIGN §9).
 */
export function checkCampsCleared(state: GameState, events: GameEvent[]): void {
  if (barbarianPlayerId(state) < 0) return;
  for (const camp of [...state.barbarianCamps]) {
    if (camp.unitIds.some((id) => state.units[id])) continue;
    let clearer: PlayerId | undefined;
    for (const ev of events) {
      if (ev.kind === 'unitKilled' && camp.unitIds.includes(ev.unitId)) clearer = ev.byPlayerId;
    }
    if (clearer !== undefined && state.players[clearer]?.civId !== BARBARIAN_CIV_ID) {
      state.players[clearer].gold += CAMP_CLEAR_GOLD + Math.floor(state.turn / 10);
    }
    state.barbarianCamps = state.barbarianCamps.filter((c) => c !== camp);
  }
}
