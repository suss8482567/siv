/**
 * Hover tile tooltip: terrain, elevation, features, resource, river, movement
 * cost and per-turn yields. Only shown for explored tiles; ownership and city
 * names additionally require the tile to be currently visible (fog courtesy).
 */
import { signal } from '@preact/signals';
import { buildContentDb } from '@/content';
import { computeVisibleTiles } from '@/engine/systems/visibility';
import { findUnitPath, reachableTiles } from '@/engine/systems/movement';
import { tileYields } from '@/engine/systems/economy';
import { civArt, resourceArt, yieldArt } from '@/assets/art';
import { ArtIcon } from './ArtIcon';
import { openHelp } from '../help';
import { selectionSignal, sessionSignal } from '../store';

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

/** P1.6 Tier-3 link: jumps into the P2.4 Help overlay at the given topic. */
function HelpLink({ topic, label, short }: { topic: string; label: string; short?: boolean }) {
  return (
    <button
      type="button"
      class="tt-help"
      data-testid={`help-link-${topic}`}
      title={`Open Help entry: ${label}`}
      onClick={(e) => {
        e.stopPropagation();
        openHelp(topic);
      }}
    >
      {short ? '→' : 'entry →'}
    </button>
  );
}

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

  // Selected-unit path preview (P1.6): how far, and reachable this turn?
  const selUnitId = selectionSignal.value.unitId;
  const selUnit = selUnitId != null ? state.units[selUnitId] : undefined;
  const pathInfo = (() => {
    if (!selUnit || selUnit.ownerId !== human.id || selUnit.tileId === tile.id) return null;
    const path = findUnitPath(state, selUnit, tile.id);
    if (!path || path.length < 2) return 'no path';
    const reach = selUnit.movementLeft > 0 ? reachableTiles(state, selUnit) : new Set<number>();
    const steps = path.length - 1;
    return `${steps} tile${steps === 1 ? '' : 's'} away · ${reach.has(tile.id) ? 'in reach' : 'out of reach'}`;
  })();

  return (
    <div class="tile-tooltip" data-testid="tile-tooltip" style={{ left: `${left}px`, top: `${top}px` }}>
      <strong>
        {terrain?.name ?? tile.terrain}
        {tile.elevation !== 'flat' ? ` · ${tile.elevation}` : ''}
        <HelpLink topic={`terrain-${tile.terrain}`} label={terrain?.name ?? tile.terrain} />
      </strong>
      {tile.features.length > 0 && (
        <small>
          {tile.features.map((f) => content.features[f]?.name ?? f).join(', ')}
          <HelpLink topic={`feature-${tile.features[0]}`} label={content.features[tile.features[0]]?.name ?? tile.features[0]} />
        </small>
      )}
      {tile.resourceId && content.resources[tile.resourceId] && (
        <small class="tt-res">
          <ArtIcon art={resourceArt(tile.resourceId)} size={14} label={content.resources[tile.resourceId].name} />
          {content.resources[tile.resourceId].name}
          <HelpLink topic={`resource-${tile.resourceId}`} label={content.resources[tile.resourceId].name} />
        </small>
      )}
      {tile.riverEdges.some(Boolean) && (
        <small>
          River
          <HelpLink topic="yield-gold" label="Gold (riverside +1)" />
        </small>
      )}
      <div class="tt-yields">
        {YIELD_ROWS.map(({ key, label }) => (
          <span title={`${label} per turn`}>
            <ArtIcon art={yieldArt(key)} size={12} label={label} />
            {y[key]}
            <HelpLink topic={`yield-${key}`} label={label} short />
          </span>
        ))}
      </div>
      <small>
        Movement cost {moves}
        <HelpLink topic={`terrain-${tile.terrain}`} label={terrain?.name ?? tile.terrain} />
      </small>
      {pathInfo && (
        <small title="Right-click to move the selected unit here">
          {pathInfo} — RMB to move
          <HelpLink topic="concept-1upt" label="One Unit Per Tile" />
        </small>
      )}
      {visible && city && (
        <small>
          {city.name} · pop {city.population}
          <HelpLink topic="concept-city-growth" label="City growth and borders" />
        </small>
      )}
      {visible && owner && content.civs[owner.civId] && (
        <small class="tt-res">
          <ArtIcon art={civArt(owner.civId)} size={12} label={content.civs[owner.civId].name} />
          {content.civs[owner.civId].name}
          <HelpLink topic={`civ-${owner.civId}`} label={content.civs[owner.civId].name} />
        </small>
      )}
    </div>
  );
}
