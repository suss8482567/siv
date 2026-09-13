/**
 * AI utility planner (M4, SPEC §12). Fixed category order — research ->
 * production -> diplomacy -> unit orders — so results are stable. Every
 * decision is deterministic (rng draws come from state.rngState); candidate
 * counts are bounded instead of wall-clock budgets.
 */
import { buildContentDb } from '../../../content';
import type { GameEvent } from '../../core/events';
import { nextRngFraction } from '../../core/rng';
import type { City, GameState, Personality, Player, PlayerId, TileId, Unit } from '../../core/types';
import { axialToOffset, hexDistance, neighborsOf } from '../../hex/axial';
import { canAttackUnit, cityDefenseStrength, effectiveStrength, resolveAttack, resolveCityAttack } from '../combat';
import { checkCampsCleared } from '../barbarian';
import { applyDeclareWar, applyOfferPeace, bordersTouch, militaryStrength } from '../diplomacy';
import { applyFoundCity, canFoundCityAt } from '../cityFound';
import { computeCityYields } from '../economy';
import { enterCostFor, executeMove, findUnitPath } from '../movement';
import { scoreStartTile } from '../../mapgen/populate';

/** Run one AI player's whole turn (engine calls this on arrival). */
export function runAiTurn(state: GameState, events: GameEvent[], playerId: PlayerId): void {
  const player = state.players[playerId];
  if (!player || !player.alive) return;
  planResearch(state, player);
  for (const city of Object.values(state.cities)) {
    if (city.ownerId === playerId) planProduction(state, player, city);
  }
  planDiplomacy(state, events, player);
  planUnitOrders(state, events, playerId);
  checkCampsCleared(state, events); // AI kills close camps just like the player's do
}

function personalityOf(state: GameState, playerId: PlayerId): Personality {
  return (
    state.players[playerId].personality ??
    { aggression: 0.5, expansionism: 0.5, scienceFocus: 0.5, defensiveness: 0.5 }
  );
}

/** Pick the next tech weighted by personality lane affinity minus cost. */
function planResearch(state: GameState, player: Player): void {
  if (player.researchingTechId) return;
  const content = buildContentDb();
  const known = new Set(player.researchedTechIds);
  const available = Object.values(content.techs).filter(
    (t) => !known.has(t.id) && t.prereqIds.every((p) => known.has(p)),
  );
  if (available.length === 0) return;
  const pers = personalityOf(state, player.id);
  const atWar = player.warsWith.length > 0;
  const laneWeight = (lane: string): number => {
    switch (lane) {
      case 'military': return pers.aggression * (atWar ? 1.6 : 0.9);
      case 'economy': return 0.8 + pers.expansionism * 0.4;
      case 'science': return 0.6 + pers.scienceFocus * 1.2;
      default: return 0.5 + pers.defensiveness * 0.6;
    }
  };
  // Small deterministic jitter so same-lane civs diverge
  const jitter = (nextRngFraction(state) - 0.5) * 4;
  const scored = available
    .map((t) => ({ id: t.id, score: laneWeight(t.lane) * 100 - t.cost / 10 + (t.id.charCodeAt(0) % 3) + jitter }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  player.researchingTechId = scored[0].id;
}

/** Fill empty production queues: threat first, then expand, then economy. */
function planProduction(state: GameState, player: Player, city: City): void {
  if (city.productionQueue.length > 0) return;
  const content = buildContentDb();
  const known = new Set(player.researchedTechIds);
  const pers = personalityOf(state, player.id);
  const threat = nearbyThreat(state, city);
  const myCityCount = Object.values(state.cities).filter((c) => c.ownerId === player.id).length;

  interface Candidate { item: { kind: 'unit' | 'building'; id: string }; score: number }
  const candidates: Candidate[] = [];
  // Diminishing returns on standing armies: beyond a garrison per city plus a
  // field force, hammers are better spent on settlers, science and gold.
  // (M5 balance: without this the AI masses warriors forever under permanent
  // barbarian threat and never builds libraries.)
  const milCount = Object.values(state.units).filter(
    (u) => u.ownerId === player.id && content.units[u.typeId]?.unitClass !== 'civilian',
  ).length;
  const armyPenalty = Math.min(30, milCount * 4);
  for (const u of Object.values(content.units)) {
    if (u.unitClass === 'civilian') continue;
    if (u.unitClass === 'recon') continue; // scouts are explorers, not soldiers (M5: str-5 scouts fed the barb grinder)
    // Uniques and tech-locked units are only legal for their owners.
    if (u.uniqueToCivId && u.uniqueToCivId !== player.civId) continue;
    if (u.requiresTechId && !known.has(u.requiresTechId)) continue;
    let score = 18 + pers.aggression * 12 + threat * 4 + (player.warsWith.length ? 22 : 0);
    score -= armyPenalty;
    if (u.unitClass === 'ranged') score += 6; // cheap siege value
    if (u.unitClass === 'siege') score += threat >= 1.5 ? 10 : -6; // siege pays off against cities
    candidates.push({ item: { kind: 'unit', id: u.id }, score });
  }
  if (myCityCount < 4) {
    const settlerScore = 16 + pers.expansionism * 34 - threat * 5;
    candidates.push({ item: { kind: 'unit', id: 'settler' }, score: settlerScore });
  }
  for (const b of Object.values(content.buildings)) {
    if (b.id === 'palace') continue; // capital-only, auto-granted
    if (b.isWonder || city.buildings.includes(b.id)) continue;
    if (b.uniqueToCivId && b.uniqueToCivId !== player.civId) continue;
    if (b.requiresTechId && !known.has(b.requiresTechId)) continue;
    let score = 14;
    if (b.id === 'granary') score += 10 + pers.expansionism * 8;
    if (b.id === 'monument') score += 8 + pers.defensiveness * 6;
    // M5 balance: a city producing zero science is in a death spiral (no tech
    // ever). Monument now carries +1S, so force it to the top until science flows.
    if (b.id === 'monument' && computeCityYields(state, city).science <= 0) score += 30;
    if (b.id === 'barracks') score += 6 + pers.aggression * 10 + threat * 2;
    // Generic pulls for the wider roster: defense, science and gold.
    if (b.defenseStrength > 0) score += pers.defensiveness * 12 + threat * 3;
    if (b.yields.science > 0) score += pers.scienceFocus * 8 + b.yields.science * 2;
    if (b.yields.gold > 0) score += b.yields.gold * 1.5;
    candidates.push({ item: { kind: 'building', id: b.id }, score });
  }
  candidates.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
  if (candidates[0]) city.productionQueue = [candidates[0].item];
}

/** Enemy military strength within 5 tiles of the city's center. */
function nearbyThreat(state: GameState, city: City): number {
  const c = state.map.tiles[city.tileId];
  let threat = 0;
  for (const unit of Object.values(state.units)) {
    if (unit.ownerId === city.ownerId) continue;
    const def = buildContentDb().units[unit.typeId];
    if (!def || def.unitClass === 'civilian') continue;
    const t = state.map.tiles[unit.tileId];
    if (hexDistance(c.q, c.r, t.q, t.r) <= 5) threat += def.strength / 10;
  }
  return threat;
}

/** War and peace, paced so early turns stay calm and wars can end. */
function planDiplomacy(state: GameState, events: GameEvent[], player: Player): void {
  const pers = personalityOf(state, player.id);
  for (const otherId of [...player.metPlayerIds]) {
    const other = state.players[otherId];
    if (!other || !other.alive || other.id === player.id) continue;
    if (player.warsWith.includes(otherId)) {
      // Sue for peace when clearly losing (checked every 6th turn per pair).
      if ((state.turn + player.id * 3 + otherId) % 6 !== 0) continue;
      if (militaryStrength(state, player.id) >= militaryStrength(state, otherId) * 0.6) continue;
      applyOfferPeace(state, events, player.id, otherId);
    } else if (state.turn > 20 && bordersTouch(state, player.id, otherId)) {
      const ratio = militaryStrength(state, player.id) / Math.max(1, militaryStrength(state, otherId));
      const relations = player.relations[otherId] ?? 0;
      const warScore = ratio * pers.aggression * 2 - pers.defensiveness - relations / 100;
      if (warScore > 1.1) applyDeclareWar(state, events, player.id, otherId);
    }
  }
}

/** Per-unit orders: attack in range, defend, settle, or explore. */
function planUnitOrders(state: GameState, events: GameEvent[], playerId: PlayerId): void {
  const roster = Object.values(state.units).filter((u) => u.ownerId === playerId);
  for (const unit of roster) {
    if (!state.units[unit.id] || unit.movementLeft <= 0) continue;
    const def = buildContentDb().units[unit.typeId];
    if (!def) continue;
    if (def.unitClass === 'civilian') {
      if (unit.typeId === 'settler') planSettler(state, events, unit);
      continue;
    }
    planMilitary(state, events, unit);
  }
}

/** Walk to the best scored spot in range and found when standing on it. */
function planSettler(state: GameState, events: GameEvent[], unit: Unit): void {
  if (canFoundCityAt(state, unit.tileId)) {
    applyFoundCity(state, events, { type: 'foundCity', unitId: unit.id });
    return;
  }
  let spot = bestSettleSpot(state, unit);
  // If blocked or no spot within 6, try a wider search before idling
  if (spot === null || spot === unit.tileId) {
    spot = bestSettleSpotWide(state, unit, 10);
  }
  if (spot === null) {
    // No settle spot at all — explore instead of idling forever
    explore(state, events, unit);
    return;
  }
  if (spot === unit.tileId) return; // truly blocked; wait a turn
  const path = findUnitPath(state, unit, spot);
  if (path) executeMove(state, events, unit, path);
  if (canFoundCityAt(state, unit.tileId)) {
    applyFoundCity(state, events, { type: 'foundCity', unitId: unit.id });
  }
}

/** Best city site within 6 tiles by start-score (ties broken by tile id). */
function bestSettleSpot(state: GameState, unit: Unit): TileId | null {
  return bestSettleSpotWide(state, unit, 6);
}

function bestSettleSpotWide(state: GameState, unit: Unit, radius: number): TileId | null {
  const from = state.map.tiles[unit.tileId];
  let best: TileId | null = null;
  let bestScore = -Infinity;
  for (const tile of state.map.tiles) {
    const d = hexDistance(from.q, from.r, tile.q, tile.r);
    if (d > radius) continue;
    if (!canFoundCityAt(state, tile.id)) continue;
    if (tile.id !== unit.tileId && Object.values(state.units).some((u) => u.tileId === tile.id)) continue;
    // Penalize distance more, and slightly prefer spots away from barbarians
    let score = scoreStartTile(state.map.tiles, tile.id, state.map.width, state.map.height) - d * 0.7;
    // Avoid settling right next to a barbarian camp
    for (const camp of state.barbarianCamps) {
      const campTile = state.map.tiles[camp.tileId];
      if (hexDistance(tile.q, tile.r, campTile.q, campTile.r) < 3) score -= 4;
    }
    if (score > bestScore) {
      bestScore = score;
      best = tile.id;
    }
  }
  return best;
}

/** Fight what's reachable, defend threatened cities, otherwise explore. */
function planMilitary(state: GameState, events: GameEvent[], unit: Unit): void {
  if (tryAttackNow(state, events, unit)) return;

  // Defend: strongest threat target near my cities pulls garrison units.
  const defendedCity = nearestThreatenedCity(state, unit);
  const enemy = nearestEnemyUnit(state, unit);
  const pers = personalityOf(state, unit.ownerId);
  if (
    defendedCity !== null &&
    (enemy === null || hexDistance(state.map.tiles[unit.tileId].q, state.map.tiles[unit.tileId].r, state.map.tiles[defendedCity].q, state.map.tiles[defendedCity].r) < enemy.dist + 2) &&
    pers.defensiveness > 0.35
  ) {
    moveToward(state, events, unit, defendedCity);
    tryAttackNow(state, events, unit);
    return;
  }
  if (enemy && enemy.dist <= 8) {
    moveToward(state, events, unit, enemy.tileId);
    tryAttackNow(state, events, unit);
    return;
  }
  explore(state, events, unit);
}

/** Attack the weakest unit in range; melee finishes zero-hp cities. */
function tryAttackNow(state: GameState, events: GameEvent[], unit: Unit): boolean {
  const roll = nextRngFraction(state);
  const victims = Object.values(state.units)
    .filter((u) => u.ownerId !== unit.ownerId && canAttackUnit(state, unit, u))
    .sort((a, b) => a.hp - b.hp || a.id - b.id);
  if (victims[0]) {
    resolveAttack(state, events, unit, victims[0], roll);
    return true;
  }
  const def = buildContentDb().units[unit.typeId];
  const isMelee = (def?.range ?? 0) <= 1;
  if (!isMelee || unit.attacksLeft <= 0) return false;
  const from = state.map.tiles[unit.tileId];
  for (const city of Object.values(state.cities).sort((a, b) => a.id - b.id)) {
    if (city.ownerId === unit.ownerId) continue;
    const t = state.map.tiles[city.tileId];
    if (hexDistance(from.q, from.r, t.q, t.r) !== 1) continue;
    // Only press a siege we can realistically push.
    if (city.hp > 60 && cityDefenseStrength(state, city.id) > effectiveStrength(state, unit) * 1.4) continue;
    resolveCityAttack(state, events, unit, city.id, roll);
    return true;
  }
  return false;
}

/** Own city with an enemy within 5 tiles, closest to this unit first. */
function nearestThreatenedCity(state: GameState, unit: Unit): TileId | null {
  const from = state.map.tiles[unit.tileId];
  let best: TileId | null = null;
  let bestDist = Infinity;
  for (const city of Object.values(state.cities)) {
    if (city.ownerId !== unit.ownerId) continue;
    const c = state.map.tiles[city.tileId];
    let threatened = false;
    for (const other of Object.values(state.units)) {
      if (other.ownerId === unit.ownerId) continue;
      const def = buildContentDb().units[other.typeId];
      if (!def || def.unitClass === 'civilian') continue;
      const t = state.map.tiles[other.tileId];
      if (hexDistance(c.q, c.r, t.q, t.r) <= 5) {
        threatened = true;
        break;
      }
    }
    if (!threatened) continue;
    const d = hexDistance(from.q, from.r, c.q, c.r);
    if (d < bestDist) {
      bestDist = d;
      best = city.tileId;
    }
  }
  return best;
}

interface EnemySighting { tileId: TileId; dist: number }

function nearestEnemyUnit(state: GameState, unit: Unit): EnemySighting | null {
  const from = state.map.tiles[unit.tileId];
  let best: EnemySighting | null = null;
  for (const other of Object.values(state.units)) {
    if (other.ownerId === unit.ownerId) continue;
    const def = buildContentDb().units[other.typeId];
    if (!def || def.unitClass === 'civilian') continue;
    const t = state.map.tiles[other.tileId];
    const dist = hexDistance(from.q, from.r, t.q, t.r);
    if (dist === 0 || dist > 12) continue;
    if (best === null || dist < best.dist || (dist === best.dist && other.tileId < best.tileId)) {
      best = { tileId: other.tileId, dist };
    }
  }
  return best;
}

/** March toward the nearest tile this player has never seen (frontier recon). */
function explore(state: GameState, events: GameEvent[], unit: Unit): void {
  const goal = nearestFrontier(state, unit);
  if (goal !== null) {
    moveToward(state, events, unit, goal);
    if (unit.movementLeft > 0) {
      // If we didn't reach the frontier, wander toward a random visible edge to avoid oscillation
      // Don't fortify — stay active for next turn
      unit.movementLeft = 0;
    }
    return;
  }
  // Nothing unexplored within 14 — patrol randomly instead of fortifying forever
  // Pick a random passable neighbor that isn't a mountain/ocean
  const t = state.map.tiles[unit.tileId];
  const options: TileId[] = [];
  for (const ax of neighborsOf(t.q, t.r)) {
    const { col, row } = axialToOffset(ax.q, ax.r);
    if (col < 0 || col >= state.map.width || row < 0 || row >= state.map.height) continue;
    const idx = row * state.map.width + col;
    if (enterCostFor(state, unit, idx) === Infinity) continue;
    if (Object.values(state.units).some(u => u.tileId === idx)) continue;
    options.push(idx);
  }
  if (options.length > 0) {
    const pick = options[Math.floor(nextRngFraction(state) * options.length)];
    const path = findUnitPath(state, unit, pick);
    if (path) executeMove(state, events, unit, path);
  }
  unit.movementLeft = 0;
  // Never fortify AI explorers — we want them to keep moving
}

/** BFS outward for the closest unexplored passable tile. */
function nearestFrontier(state: GameState, unit: Unit): TileId | null {
  const player = state.players[unit.ownerId];
  const explored = new Set(player.exploredTileIds);
  const { width, height } = state.map;
  const start = unit.tileId;
  const seen = new Set<TileId>([start]);
  let frontier: TileId[] = [start];
  let depth = 0;
  while (frontier.length > 0 && depth < 14) {
    // Sort by hex distance to start for more natural expansion
    const from = state.map.tiles[start];
    frontier.sort((a, b) => {
      const ta = state.map.tiles[a];
      const tb = state.map.tiles[b];
      const da = hexDistance(from.q, from.r, ta.q, ta.r);
      const db = hexDistance(from.q, from.r, tb.q, tb.r);
      return da - db || a - b;
    });
    const next: TileId[] = [];
    for (const id of frontier) {
      const isPassable = enterCostFor(state, unit, id) !== Infinity;
      if (!explored.has(id) && isPassable) return id;
      const t = state.map.tiles[id];
      for (const ax of neighborsOf(t.q, t.r)) {
        const { col, row } = axialToOffset(ax.q, ax.r);
        if (col < 0 || col >= width || row < 0 || row >= height) continue;
        const idx = row * width + col;
        if (seen.has(idx)) continue;
        seen.add(idx);
        if (enterCostFor(state, unit, idx) === Infinity) continue;
        next.push(idx);
      }
    }
    frontier = next;
    depth += 1;
  }
  return null;
}

function moveToward(state: GameState, events: GameEvent[], unit: Unit, goalTileId: TileId): void {
  const path = findUnitPath(state, unit, goalTileId);
  if (path && path.length > 1) executeMove(state, events, unit, path);
}
