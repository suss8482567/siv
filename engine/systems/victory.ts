/**
 * Victory & elimination (M5). Domination: hold every original capital.
 * Score: best GAME_DESIGN §11 total when the turn limit passes. A player
 * with no cities and no settlers left in the field is eliminated. All
 * checks are deterministic and consume no RNG.
 */
import { buildContentDb } from '../../content';
import type { GameEvent } from '../core/events';
import type { GameState, PlayerId, VictoryKind } from '../core/types';

/** Record `playerId`'s first-founded city as their original capital. */
export function noteCapital(state: GameState, playerId: PlayerId, cityId: number): void {
  const player = state.players[playerId];
  if (player && player.civId !== 'barbarians' && player.originalCapitalCityId === undefined) {
    player.originalCapitalCityId = cityId;
  }
}

/** A player with no cities and no settler to found one with is out. */
export function isEliminated(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  if (!player || !player.alive || player.civId === 'barbarians') return false;
  for (const city of Object.values(state.cities)) {
    if (city.ownerId === playerId) return false;
  }
  for (const unit of Object.values(state.units)) {
    if (unit.ownerId === playerId && unit.typeId === 'settler') return false;
  }
  return true;
}

/** Elimination sweep over every player; emits `playerDefeated` per loss. */
export function checkEliminations(state: GameState, events: GameEvent[]): void {
  for (const player of state.players) {
    if (isEliminated(state, player.id)) {
      player.alive = false;
      events.push({ kind: 'playerDefeated', playerId: player.id });
    }
  }
}

/** Does `playerId` hold every original capital, their own included? */
export function holdsAllOriginalCapitals(state: GameState, playerId: PlayerId): boolean {
  const me = state.players[playerId];
  if (!me?.alive) return false;
  // Never founded a capital: nothing to hold, cannot win domination.
  if (me.originalCapitalCityId === undefined) return false;
  if (state.cities[me.originalCapitalCityId]?.ownerId !== playerId) return false;
  for (const other of state.players) {
    if (other.id === playerId || other.civId === 'barbarians') continue;
    const capId = other.originalCapitalCityId;
    if (capId === undefined) {
      // A live rival that has not settled yet could still found a capital —
      // only eliminated players stop blocking domination.
      if (other.alive) return false;
      continue;
    }
    const cap = state.cities[capId];
    if (!cap || cap.ownerId !== playerId) return false;
  }
  return true;
}

/** First live player in turn order holding all original capitals wins. */
export function checkDomination(state: GameState, events: GameEvent[]): void {
  if (state.winner) return;
  for (const id of state.playerOrder) {
    if (holdsAllOriginalCapitals(state, id)) {
      awardVictory(state, events, id, 'domination');
      return;
    }
  }
}

/** GAME_DESIGN §11: cities×3 + pop×2 + tiles×0.25 + techs×4 + wonders×5. */
export function computeScore(state: GameState, playerId: PlayerId): number {
  const content = buildContentDb();
  let cities = 0;
  let pop = 0;
  let tiles = 0;
  let wonders = 0;
  for (const city of Object.values(state.cities)) {
    if (city.ownerId !== playerId) continue;
    cities += 1;
    pop += city.population;
    tiles += city.ownedTileIds.length;
    for (const b of city.buildings) {
      if (content.buildings[b]?.isWonder) wonders += 1;
    }
  }
  const techs = state.players[playerId]?.researchedTechIds.length ?? 0;
  return cities * 3 + pop * 2 + tiles * 0.25 + techs * 4 + wonders * 5;
}

/** Turn limit passed: highest score wins; ties break by turn order. */
export function awardScoreVictory(state: GameState, events: GameEvent[]): void {
  if (state.winner) return;
  let bestId = -1;
  let bestScore = -Infinity;
  for (const id of state.playerOrder) {
    const p = state.players[id];
    if (!p?.alive || p.civId === 'barbarians') continue;
    const score = computeScore(state, id);
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  if (bestId >= 0) awardVictory(state, events, bestId, 'score');
}

/** Set the winner and announce it. First award wins; later calls no-op. */
export function awardVictory(
  state: GameState,
  events: GameEvent[],
  playerId: PlayerId,
  victory: VictoryKind,
): void {
  if (state.winner) return;
  state.winner = { playerId, victory };
  events.push({ kind: 'victoryAchieved', playerId, victory });
}
