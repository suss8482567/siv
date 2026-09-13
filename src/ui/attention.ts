/**
 * "Needs attention" selectors (Phase 1 rework, docs/UI_REWORK.md P1.1): pure,
 * read-only queries over GameState for the human player. The End-Turn badge and
 * jump list consume these; unit tests in tests/ui/attention.test.ts pin them.
 */
import { buildContentDb } from '@/content';
import type { GameState, TileId } from '@/engine';

export type AttentionKind = 'unit' | 'city' | 'research';

export interface AttentionItem {
  kind: AttentionKind;
  /** Unit or city id; undefined for research. */
  id?: number;
  /** Tile to select + center when jumping. */
  tileId: TileId;
  /** Short human label, e.g. "Warrior", "Roma — empty queue". */
  label: string;
}

/** Units that still need orders — same predicate as the N hotkey cycle. */
export function unitsNeedingOrders(state: GameState, humanId: number): AttentionItem[] {
  const content = buildContentDb();
  return Object.values(state.units)
    .filter((u) => u.ownerId === humanId && u.movementLeft > 0 && !u.slept && !u.fortified)
    .sort((a, b) => a.id - b.id)
    .map((u) => ({
      kind: 'unit' as const,
      id: u.id,
      tileId: u.tileId,
      label: content.units[u.typeId]?.name ?? u.typeId,
    }));
}

/** Human cities with nothing queued. */
export function citiesNeedingProduction(state: GameState, humanId: number): AttentionItem[] {
  return Object.values(state.cities)
    .filter((c) => c.ownerId === humanId && c.productionQueue.length === 0)
    .sort((a, b) => a.id - b.id)
    .map((c) => ({
      kind: 'city' as const,
      id: c.id,
      tileId: c.tileId,
      label: `${c.name} — empty queue`,
    }));
}

/** True when the human has no active research. Tile points at the capital. */
export function researchNeeded(state: GameState, humanId: number): AttentionItem[] {
  const me = state.players[humanId];
  if (!me || me.researchingTechId) return [];
  const capital =
    Object.values(state.cities).find((c) => c.ownerId === humanId && c.buildings.includes('palace')) ??
    Object.values(state.cities).find((c) => c.ownerId === humanId);
  const settler = Object.values(state.units).find((u) => u.ownerId === humanId);
  const tileId = capital?.tileId ?? settler?.tileId ?? 0;
  return [{ kind: 'research', tileId, label: 'Pick research' }];
}

/** Full attention list in jump order: units → cities → research. */
export function getAttentionItems(state: GameState): AttentionItem[] {
  const humanId = state.players.find((p) => p.isHuman)?.id;
  if (humanId === undefined || state.winner) return [];
  return [
    ...unitsNeedingOrders(state, humanId),
    ...citiesNeedingProduction(state, humanId),
    ...researchNeeded(state, humanId),
  ];
}
