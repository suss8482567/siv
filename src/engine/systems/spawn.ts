/**
 * Shared unit creation: spawns onto the preferred tile or, when 1UPT blocks
 * it, the first free adjacent land tile (same rule as city production).
 */
import { buildContentDb } from '../../content';
import { neighborsOf, tileIndex } from '../hex/axial';
import type { GameState, PlayerId, TileId, Unit } from '../core/types';

export function spawnUnit(
  state: GameState,
  ownerId: PlayerId,
  typeId: string,
  preferredTileId: TileId,
): Unit {
  if (preferredTileId < 0 || !state.map.tiles[preferredTileId]) {
    throw new Error(`spawnUnit: invalid preferredTileId ${preferredTileId}`);
  }
  const def = buildContentDb().units[typeId];
  let tile = state.map.tiles[preferredTileId];
  const occupied = new Set(Object.values(state.units).map((u) => u.tileId));
  if (occupied.has(tile.id)) {
    for (const ax of neighborsOf(tile.q, tile.r)) {
      const nb = tileIndex(ax.q, ax.r, state.map.width, state.map.height);
      if (nb < 0) continue;
      const t = state.map.tiles[nb];
      if (t.terrain === 'ocean' || t.terrain === 'coast' || occupied.has(nb)) continue;
      tile = t;
      break;
    }
  }
  const unit: Unit = {
    id: state.nextUnitId++,
    typeId,
    ownerId,
    tileId: tile.id,
    hp: 100,
    movementLeft: def?.moves ?? 2,
    attacksLeft: 1,
    fortified: false,
    slept: false,
    xp: 0,
    promotions: [],
  };
  state.units[unit.id] = unit;
  return unit;
}
