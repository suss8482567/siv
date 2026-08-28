/**
 * Hover tile tooltip: terrain, elevation, features, resource, river, movement
 * cost and per-turn yields. Only shown for explored tiles; ownership and city
 * names additionally require the tile to be currently visible (fog courtesy).
 */
import { signal } from '@preact/signals';
import { buildContentDb } from '@/content';
import { computeVisibleTiles } from '@/engine/systems/visibility';
import { tileYields } from '@/engine/systems/economy';
import { civArt, resourceArt, yieldArt } from '@/assets/art';
import { ArtIcon } from './ArtIcon';
import { sessionSignal } from '../store';

export interface TileHover {
  tileId: number;
  x: number;
  y: number;
}
/** UI-only hover state (never part of GameState); null when off-map. */
export const hoverTileSignal = signal<TileHover | null>(null);

const YIELD_ROWS: Array<{ key: 'food' | 'production' | 'gold' | 'science' | 'culture'; label: string }> = [
  { key: 'food', label: 'Food' },
  { key: 'production', label: 'Production' },
  { key: 'gold', label: 'Gold' },
  { key: 'science', label: 'Science' },
  { key: 'culture', label: 'Culture' },
];

export function TileTooltip() {
  const hover = hoverTileSignal.value;
  const session = sessionSignal.value;
  if (!hover || !session || session.state.winner) return null;
  const state = session.state;
  const human = state.players.find((p) => p.isHuman);
  if (!human || !human.exploredTileIds.includes(hover.tileId)) return null;
  const tile = state.map.tiles[hover.tileId];
  if (!tile) return null;

  const content = buildContentDb();
  const terrain = content.terrains[tile.terrain];
  const visible = computeVisibleTiles(state, human.id).has(tile.id);
  const owner = tile.ownerPlayerId !== undefined ? state.players[tile.ownerPlayerId] : undefined;
  const city = tile.cityId !== undefined ? state.cities[tile.cityId] : undefined;
  const y = tileYields(state, tile.id);
  const moves =
    (terrain?.movementCost ?? 1) +
    tile.features.reduce((sum, f) => sum + (content.features[f]?.movementCostDelta ?? 0), 0);

  const left = Math.min(hover.x + 16, window.innerWidth - 236);
  const top = Math.min(hover.y + 18, window.innerHeight - 180);

  return (
    <div class="tile-tooltip" data-testid="tile-tooltip" style={{ left: `${left}px`, top: `${top}px` }}>
      <strong>
        {terrain?.name ?? tile.terrain}
        {tile.elevation !== 'flat' ? ` · ${tile.elevation}` : ''}
      </strong>
      {tile.features.length > 0 && (
        <small>{tile.features.map((f) => content.features[f]?.name ?? f).join(', ')}</small>
      )}
      {tile.resourceId && content.resources[tile.resourceId] && (
        <small class="tt-res">
          <ArtIcon art={resourceArt(tile.resourceId)} size={14} label={content.resources[tile.resourceId].name} />
          {content.resources[tile.resourceId].name}
        </small>
      )}
      {tile.riverEdges.some(Boolean) && <small>River</small>}
      <div class="tt-yields">
        {YIELD_ROWS.map(({ key, label }) => (
          <span title={`${label} per turn`}>
            <ArtIcon art={yieldArt(key)} size={12} label={label} />
            {y[key]}
          </span>
        ))}
      </div>
      <small>Movement cost {moves}</small>
      {visible && city && (
        <small>
          {city.name} · pop {city.population}
        </small>
      )}
      {visible && owner && content.civs[owner.civId] && (
        <small class="tt-res">
          <ArtIcon art={civArt(owner.civId)} size={12} label={content.civs[owner.civId].name} />
          {content.civs[owner.civId].name}
        </small>
      )}
    </div>
  );
}
