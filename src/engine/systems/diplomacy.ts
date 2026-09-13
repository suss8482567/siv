/**
 * Minimal diplomacy (M4, SPEC §9 commands / GAME_DESIGN §10): contact
 * discovery through line of sight, declare war / offer peace / denounce with
 * per-pair relations tracking. No trades in v0.
 */
import { buildContentDb } from '../../content';
import type { GameEvent } from '../core/events';
import type { GameState, PlayerId } from '../core/types';
import { axialToOffset, neighborsOf } from '../hex/axial';
import { effectiveStrength } from './combat';
import { computeVisibleTiles } from './visibility';

export const DENOUNCE_COOLDOWN = 20;
export const WAR_RELATION_HIT = -40;
export const PEACE_RELATION_BOOST = 20;
export const DENOUNCE_RELATION_HIT = -25;

export type PeaceResult = 'accepted' | 'rejected';

/** AI civs start touchier toward the human as difficulty rises. */
export function relationBaseline(state: GameState, selfId: PlayerId, otherId: PlayerId): number {
  const other = state.players[otherId];
  if (!other) return 0;
  return other.isHuman ? -6 * Math.max(0, state.difficulty) : 0;
}

export function isBarbarian(state: GameState, playerId: PlayerId): boolean {
  return state.players[playerId]?.civId === 'barbarians';
}

/** Record a first meeting between two civs (both directions). */
export function meet(state: GameState, a: PlayerId, b: PlayerId): void {
  if (a === b) return;
  const pa = state.players[a];
  const pb = state.players[b];
  if (!pa || !pb || pa.alive === false || pb.alive === false) return;
  if (isBarbarian(state, a) || isBarbarian(state, b)) return;
  if (!pa.metPlayerIds.includes(b)) {
    pa.metPlayerIds.push(b);
    pa.relations[b] = relationBaseline(state, a, b);
  }
  if (!pb.metPlayerIds.includes(a)) {
    pb.metPlayerIds.push(a);
    pb.relations[a] = relationBaseline(state, b, a);
  }
}

/** Line-of-sight meeting: seeing a foreign unit or city introduces both civs. */
export function discoverContacts(state: GameState, playerId: PlayerId): void {
  const visible = computeVisibleTiles(state, playerId);
  for (const unit of Object.values(state.units)) {
    if (visible.has(unit.tileId)) meet(state, playerId, unit.ownerId);
  }
  for (const city of Object.values(state.cities)) {
    if (visible.has(city.tileId)) meet(state, playerId, city.ownerId);
  }
}

/** Total military strength of a player's units (peace/war utility math). */
export function militaryStrength(state: GameState, playerId: PlayerId): number {
  let str = 0;
  for (const unit of Object.values(state.units)) {
    if (unit.ownerId !== playerId) continue;
    const def = buildContentDb().units[unit.typeId];
    if (!def || def.unitClass === 'civilian') continue;
    str += effectiveStrength(state, unit);
  }
  return str;
}

function addWar(state: GameState, events: GameEvent[], a: PlayerId, b: PlayerId): void {
  const pa = state.players[a];
  const pb = state.players[b];
  if (!pa.warsWith.includes(b)) pa.warsWith.push(b);
  if (!pb.warsWith.includes(a)) pb.warsWith.push(a);
  shiftRelations(state, a, b, WAR_RELATION_HIT);
  events.push({ kind: 'warDeclared', a, b });
}

/** Declare war. Returns false when illegal (unmet, barbarian, already at war). */
export function applyDeclareWar(
  state: GameState,
  events: GameEvent[],
  actorId: PlayerId,
  targetId: PlayerId,
): boolean {
  const pa = state.players[actorId];
  const pb = state.players[targetId];
  if (!pa || !pb || !pa.alive || !pb.alive) return false;
  if (isBarbarian(state, actorId) || isBarbarian(state, targetId)) return false;
  if (!pa.metPlayerIds.includes(targetId)) return false;
  if (pa.warsWith.includes(targetId)) return false;
  addWar(state, events, actorId, targetId);
  return true;
}

/**
 * AI peace utility (GAME_DESIGN §10): the AI folds when the requester's
 * military outweighs its own by a personality-scaled margin.
 */
export function aiAcceptsPeace(state: GameState, aiId: PlayerId, requesterId: PlayerId): boolean {
  const ai = state.players[aiId];
  if (!ai) return false;
  if (Object.values(state.cities).every((c) => c.ownerId !== aiId)) return true; // existential
  const mine = militaryStrength(state, aiId);
  const theirs = militaryStrength(state, requesterId);
  const aggression = ai.personality?.aggression ?? 0.5;
  return theirs > mine * (1.2 - aggression) || mine === 0;
}

export type PeaceOutcome = PeaceResult | 'illegal';

/** Offer peace; an AI target accepts via utility, otherwise nothing changes. */
export function applyOfferPeace(
  state: GameState,
  events: GameEvent[],
  actorId: PlayerId,
  targetId: PlayerId,
): PeaceOutcome {
  const pa = state.players[actorId];
  const pb = state.players[targetId];
  if (!pa || !pb || !pa.warsWith.includes(targetId)) return 'illegal';
  if (isBarbarian(state, actorId) || isBarbarian(state, targetId)) return 'illegal';
  if (!pb.isHuman && !aiAcceptsPeace(state, targetId, actorId)) return 'rejected';
  pa.warsWith = pa.warsWith.filter((id) => id !== targetId);
  pb.warsWith = pb.warsWith.filter((id) => id !== actorId);
  shiftRelations(state, actorId, targetId, PEACE_RELATION_BOOST);
  events.push({ kind: 'peaceMade', a: actorId, b: targetId });
  return 'accepted';
}

/** Denounce: -relations both ways, once per cooldown window per pair. */
export function applyDenounce(
  state: GameState,
  events: GameEvent[],
  actorId: PlayerId,
  targetId: PlayerId,
): boolean {
  const pa = state.players[actorId];
  const pb = state.players[targetId];
  if (!pa || !pb || !pa.alive || !pb.alive) return false;
  if (isBarbarian(state, actorId) || isBarbarian(state, targetId)) return false;
  if (!pa.metPlayerIds.includes(targetId)) return false;
  const last = pa.denounceTurns[targetId];
  if (last !== undefined && state.turn - last < DENOUNCE_COOLDOWN) return false;
  pa.denounceTurns[targetId] = state.turn;
  shiftRelations(state, actorId, targetId, DENOUNCE_RELATION_HIT);
  if (!pb.denouncedBy.includes(actorId)) pb.denouncedBy.push(actorId);
  events.push({ kind: 'denounced', byPlayerId: actorId, targetPlayerId: targetId });
  return true;
}

function shiftRelations(
  state: GameState,
  a: PlayerId,
  b: PlayerId,
  delta: number,
): void {
  const pa = state.players[a];
  const pb = state.players[b];
  pa.relations[b] = clamp100((pa.relations[b] ?? 0) + delta);
  pb.relations[a] = clamp100((pb.relations[a] ?? 0) + delta);
}

function clamp100(v: number): number {
  return Math.max(-100, Math.min(100, v));
}

/**
 * Per-turn relations drift toward the baseline: slow detente, border friction
 * and ongoing wars pull the score back down (GAME_DESIGN §10).
 */
export function updateRelations(state: GameState, playerId: PlayerId): void {
  const self = state.players[playerId];
  for (const otherId of self.metPlayerIds) {
    if (isBarbarian(state, otherId)) continue;
    let drift = 1; // détente
    if (self.warsWith.includes(otherId)) drift -= 4;
    if (bordersTouch(state, playerId, otherId)) drift -= 2;
    const cur = self.relations[otherId] ?? 0;
    self.relations[otherId] = clamp100(cur + drift);
  }
}

/** True when any pair of owned tiles from the two players is adjacent. */
export function bordersTouch(state: GameState, a: PlayerId, b: PlayerId): boolean {
  const { width, height } = state.map;
  for (const tile of state.map.tiles) {
    if (tile.ownerPlayerId !== a) continue;
    for (const nb of neighborsOf(tile.q, tile.r)) {
      const { col, row } = axialToOffset(nb.q, nb.r);
      if (col < 0 || col >= width || row < 0 || row >= height) continue;
      if (state.map.tiles[row * width + col].ownerPlayerId === b) return true;
    }
  }
  return false;
}
