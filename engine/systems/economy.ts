/**
 * City economy (M2): tile yields, automatic worked-tile assignment, growth,
 * production queues, research, culture-driven border expansion and treasury
 * upkeep. All formulas live in SPEC §9.
 */
import { buildContentDb } from '../../content';
import type { Yields } from '../../content/schema';
import type { GameEvent } from '../core/events';
import type { City, GameState, PlayerId, ProductionItem, TileId } from '../core/types';
import { neighborsOf, tileIndex } from '../hex/axial';
import { spawnUnit } from './spawn';

export function emptyYields(): Yields {
  return { food: 0, production: 0, gold: 0, science: 0, culture: 0 };
}

export function addYields(into: Yields, delta: Partial<Yields>): void {
  into.food += delta.food ?? 0;
  into.production += delta.production ?? 0;
  into.gold += delta.gold ?? 0;
  into.science += delta.science ?? 0;
  into.culture += delta.culture ?? 0;
}

/** Base yields of a single tile: terrain + features + resource. */
export function tileYields(state: GameState, tileId: TileId): Yields {
  const content = buildContentDb();
  const tile = state.map.tiles[tileId];
  const out = emptyYields();
  const tdef = content.terrains[tile.terrain];
  if (tdef) addYields(out, tdef.yields);
  for (const f of tile.features) {
    const fdef = content.features[f];
    if (fdef) addYields(out, fdef.yieldsDelta);
  }
  if (tile.resourceId) {
    const rdef = content.resources[tile.resourceId];
    if (rdef) addYields(out, rdef.yieldsDelta);
  }
  // Rivers feed farms: +1 gold on riverside tiles (SPEC §9.2).
  if (tile.riverEdges.some(Boolean)) out.gold += 1;
  return out;
}

/** Relative desirability of a yield bundle — drives auto-worked-tile choice. */
function yieldScore(y: Yields): number {
  return y.food * 1.2 + y.production * 1.1 + y.gold * 0.7 + y.science * 1.3 + y.culture;
}

/**
 * Assign the city's population to its best tiles (center is free). Clears
 * stale assignments first; returns the worked tile ids. Must be called
 * explicitly before yield computation — never from render paths.
 */
export function assignWorkedTiles(state: GameState, city: City): TileId[] {
  for (const t of state.map.tiles) {
    if (t.workedByCityId === city.id) t.workedByCityId = undefined;
  }
  const candidates: { id: TileId; score: number }[] = [];
  for (const tid of city.ownedTileIds) {
    if (tid === city.tileId) continue;
    candidates.push({ id: tid, score: yieldScore(tileYields(state, tid)) });
  }
  candidates.sort((a, b) => b.score - a.score || a.id - b.id);
  const worked = candidates.slice(0, city.population).map((c) => c.id);
  for (const tid of worked) state.map.tiles[tid].workedByCityId = city.id;
  return [city.tileId, ...worked];
}

/** Pure read of currently-worked tiles (center + tiles marked by assignWorkedTiles). */
function workedTileIds(state: GameState, city: City): TileId[] {
  const out: TileId[] = [city.tileId];
  for (const tid of city.ownedTileIds) {
    if (tid === city.tileId) continue;
    if (state.map.tiles[tid].workedByCityId === city.id) out.push(tid);
  }
  // Fallback: if nothing assigned yet (fresh city before first tick), compute on the fly without mutating
  if (out.length === 1 && city.ownedTileIds.length > 1 && city.population > 0) {
    const candidates: { id: TileId; score: number }[] = [];
    for (const tid of city.ownedTileIds) {
      if (tid === city.tileId) continue;
      candidates.push({ id: tid, score: yieldScore(tileYields(state, tid)) });
    }
    candidates.sort((a, b) => b.score - a.score || a.id - b.id);
    for (const c of candidates.slice(0, city.population)) out.push(c.id);
  }
  return out;
}

/** Full per-turn yield bundle for a city (center + worked tiles + buildings). Pure — does not mutate. */
export function computeCityYields(state: GameState, city: City): Yields {
  const content = buildContentDb();
  const out = emptyYields();
  for (const tid of workedTileIds(state, city)) addYields(out, tileYields(state, tid));
  for (const bid of city.buildings) {
    const bdef = content.buildings[bid];
    if (bdef) addYields(out, bdef.yields);
  }
  return out;
}

export function foodToGrow(population: number): number {
  return Math.round(14 + 7 * Math.pow(population, 1.4));
}

/** Difficulty yield bonus for AI players: ×1.10/1.20/1.35 on Standard/Hard/Brutal (SPEC §12). */
export function aiYieldMult(state: GameState, playerId: PlayerId): number {
  const p = state.players[playerId];
  if (!p || p.isHuman || state.difficulty <= 0) return 1;
  return [1, 1.1, 1.2, 1.35][Math.min(state.difficulty, 3)];
}

/** Boost an AI city's non-food yields by the difficulty multiplier in place. */
function scaleForDifficulty(y: Yields, state: GameState, playerId: PlayerId): void {
  const mult = aiYieldMult(state, playerId);
  if (mult === 1) return;
  y.production = Math.round(y.production * mult);
  y.gold = Math.round(y.gold * mult);
  y.science = Math.round(y.science * mult);
  y.culture = Math.round(y.culture * mult);
}

export function cultureForNextBorder(ownedTileCount: number): number {
  return Math.round(12 + 4 * Math.pow(ownedTileCount, 1.1));
}

/** Best unowned tile adjacent to this city's territory, or -1. */
function nextBorderTile(state: GameState, city: City): TileId {
  let best = -1;
  let bestScore = -Infinity;
  for (const tid of city.ownedTileIds) {
    for (const ax of neighborsOf(state.map.tiles[tid].q, state.map.tiles[tid].r)) {
      const nb = tileIndex(ax.q, ax.r, state.map.width, state.map.height);
      if (nb < 0) continue;
      const t = state.map.tiles[nb];
      if (t.ownerPlayerId !== undefined) continue;
      if (t.terrain === 'ocean') continue;
      const score = yieldScore(tileYields(state, nb));
      if (score > bestScore) {
        bestScore = score;
        best = nb;
      }
    }
  }
  return best;
}

/**
 * May this player queue this item here? Enforces tech gating, civ uniques,
 * no duplicate buildings and one-per-world wonders. Shared by dispatch
 * validation, the city screen and the AI planner so all three stay in sync.
 */
export function canProduce(state: GameState, playerId: PlayerId, city: City, item: ProductionItem): boolean {
  const content = buildContentDb();
  const player = state.players[playerId];
  if (!player) return false;
  const known = new Set(player.researchedTechIds);
  const techOk = (requiresTechId?: string) => !requiresTechId || known.has(requiresTechId);
  const civOk = (uniqueToCivId?: string) => !uniqueToCivId || uniqueToCivId === player.civId;

  // Palace is capital-only and auto-granted; never queueable
  if (item.id === 'palace') return false;

  if (item.kind === 'unit') {
    const def = content.units[item.id];
    return !!def && techOk(def.requiresTechId) && civOk(def.uniqueToCivId);
  }
  const def = content.buildings[item.id];
  if (!def) return false;
  if (!techOk(def.requiresTechId) || !civOk(def.uniqueToCivId)) return false;
  if (city.buildings.includes(item.id)) return false; // no duplicate buildings
  // Wonders are one per world.
  if (def.isWonder && Object.values(state.cities).some((c) => c.buildings.includes(item.id))) {
    return false;
  }
  return true;
}

/** One city's growth + production + culture tick. */
export function processCity(state: GameState, events: GameEvent[], city: City): void {
  const content = buildContentDb();
  // Assign worked tiles exactly once per economy tick; display reads the result purely via computeCityYields
  assignWorkedTiles(state, city);
  const y = computeCityYields(state, city);
  scaleForDifficulty(y, state, city.ownerId);

  // Cities recover between sieges.
  if (city.hp < 200) city.hp = Math.min(200, city.hp + 10);

  // Growth / starvation.
  const need = foodToGrow(city.population);
  city.foodStored += y.food;
  if (city.foodStored >= need) {
    city.foodStored -= need;
    city.population += 1;
    events.push({ kind: 'cityGrew', cityId: city.id, population: city.population });
  } else if (city.foodStored < 0) {
    if (city.population > 1) {
      city.population -= 1;
      city.foodStored = 0;
      events.push({ kind: 'cityStarved', cityId: city.id, population: city.population });
    } else {
      city.foodStored = 0;
    }
  }

  // Production.
  const item = city.productionQueue[0];
  if (item) {
    const cost = item.kind === 'unit' ? content.units[item.id]?.cost : content.buildings[item.id]?.cost;
    if (cost !== undefined) {
      city.productionStored += y.production;
      if (city.productionStored >= cost) {
        city.productionStored -= cost;
        city.productionQueue.shift();
        completeItem(state, events, city, item);
      }
    }
  }

  // Border expansion.
  city.cultureStored += y.culture;
  if (y.culture > 0) {
    const goal = cultureForNextBorder(city.ownedTileIds.length);
    if (city.cultureStored >= goal) {
      city.cultureStored -= goal;
      const tid = nextBorderTile(state, city);
      if (tid >= 0) {
        state.map.tiles[tid].ownerPlayerId = city.ownerId;
        state.map.tiles[tid].cityId = city.id;
        city.ownedTileIds.push(tid);
        events.push({ kind: 'bordersExpanded', cityId: city.id, tileIds: [tid] });
      }
    }
  }
}

function completeItem(state: GameState, events: GameEvent[], city: City, item: ProductionItem): void {
  if (item.kind === 'building') {
    if (!city.buildings.includes(item.id)) city.buildings.push(item.id);
    events.push({ kind: 'productionComplete', cityId: city.id, item });
    return;
  }
  // Units spawn on the city tile, or the first free adjacent land tile.
  const unit = spawnUnit(state, city.ownerId, item.id, city.tileId);
  unit.movementLeft = 0;
  unit.attacksLeft = 0;
  events.push({ kind: 'productionComplete', cityId: city.id, item });
}

/** Dev tools: finish the queued item immediately, whatever the stored progress. */
export function forceCompleteCurrentItem(state: GameState, events: GameEvent[], city: City): boolean {
  const item = city.productionQueue[0];
  if (!item) return false;
  const content = buildContentDb();
  const cost = item.kind === 'unit' ? content.units[item.id]?.cost : content.buildings[item.id]?.cost;
  if (cost === undefined) return false;
  city.productionQueue.shift();
  completeItem(state, events, city, item);
  return true;
}

/** Research + treasury tick for one player at end of their turn. */
export function processPlayerEconomy(state: GameState, events: GameEvent[], playerId: PlayerId): void {
  const content = buildContentDb();
  const player = state.players[playerId];

  // Treasury: city building upkeep + unit maintenance.
  let income = 0;
  let expense = 0;
  for (const city of Object.values(state.cities)) {
    if (city.ownerId !== playerId) continue;
    const y = computeCityYields(state, city);
    income += Math.round(y.gold * aiYieldMult(state, playerId));
    for (const bid of city.buildings) expense += content.buildings[bid]?.maintenance ?? 0;
  }
  income += player.devIncome?.gold ?? 0; // dev tools: flat cheat income
  for (const unit of Object.values(state.units)) {
    if (unit.ownerId !== playerId) continue;
    expense += content.units[unit.typeId]?.maintenance ?? 0;
  }
  player.gold += income - expense;
  if (player.gold < 0) player.gold = 0; // v0: no disband spiral yet

  // Science.
  for (const city of Object.values(state.cities)) {
    if (city.ownerId === playerId) {
      const y = computeCityYields(state, city);
      player.scienceStored += Math.round(y.science * aiYieldMult(state, playerId));
    }
  }
  player.scienceStored += player.devIncome?.science ?? 0;
  const tech = player.researchingTechId ? content.techs[player.researchingTechId] : undefined;
  if (tech && player.scienceStored >= tech.cost) {
    player.scienceStored -= tech.cost;
    if (!player.researchedTechIds.includes(tech.id)) player.researchedTechIds.push(tech.id);
    player.researchingTechId = undefined;
    events.push({ kind: 'researchComplete', techId: tech.id });
  }
}
