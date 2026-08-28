/**
 * Fog of war (M1): three states per player — hidden, remembered (explored but
 * not currently seen), visible. Visibility = own territory + unit sight
 * radii; exploration is persistent and stored sorted on each player.
 */
import { buildContentDb } from '../../content';
import { axialToOffset, tilesInRange } from '../hex/axial';
import type { GameState, PlayerId, TileId } from '../core/types';

export type FogState = 'hidden' | 'remembered' | 'visible';

export function computeVisibleTiles(state: GameState, playerId: PlayerId): Set<TileId> {
  const visible = new Set<TileId>();
  if (state.players[playerId]?.devRevealAll) {
    for (const t of state.map.tiles) visible.add(t.id);
    return visible;
  }
  const content = buildContentDb();
  for (const city of Object.values(state.cities)) {
    if (city.ownerId !== playerId) continue;
    visible.add(city.tileId);
    for (const t of city.ownedTileIds) visible.add(t);
  }
  for (const unit of Object.values(state.units)) {
    if (unit.ownerId !== playerId) continue;
    const def = content.units[unit.typeId];
    addRadius(state, visible, unit.tileId, def?.sightRange ?? 2);
  }
  return visible;
}

/** Reveal `radius` around a tile permanently for one player (kept sorted+unique). */
export function revealAround(
  state: GameState,
  playerId: PlayerId,
  centerTileId: TileId,
  radius: number,
): void {
  const player = state.players[playerId];
  const set = new Set(player.exploredTileIds);
  addRadius(state, set, centerTileId, radius);
  player.exploredTileIds = [...set].sort((a, b) => a - b);
}

/** Dev tools: explore the entire map (or wipe exploration back to fog). */
export function setAllTilesExplored(state: GameState, playerId: PlayerId, explored: boolean): void {
  const player = state.players[playerId];
  if (!player) return;
  player.exploredTileIds = explored
    ? state.map.tiles.map((t) => t.id).sort((a, b) => a - b)
    : [];
}

export function fogStateFor(
  state: GameState,
  playerId: PlayerId,
  visible: Set<TileId>,
  tileId: TileId,
): FogState {
  if (state.players[playerId]?.devRevealAll || visible.has(tileId)) return 'visible';
  const explored = state.players[playerId].exploredTileIds;
  if (binarySearch(explored, tileId) >= 0) return 'remembered';
  return 'hidden';
}

function addRadius(
  state: GameState,
  set: Set<TileId>,
  centerTileId: TileId,
  radius: number,
): void {
  const { width, height } = state.map;
  const c = state.map.tiles[centerTileId];
  if (!c) return;
  for (const t of tilesInRange(c.q, c.r, radius)) {
    const { col, row } = axialToOffset(t.q, t.r);
    if (col < 0 || col >= width || row < 0 || row >= height) continue;
    set.add(row * width + col);
  }
}

function binarySearch(sorted: number[], target: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = sorted[mid];
    if (v === target) return mid;
    if (v < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}
