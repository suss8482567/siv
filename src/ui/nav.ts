/**
 * Map navigation helpers (Phase 1 rework, docs/UI_REWORK.md P1.1/P1.2): jump the
 * camera to a tile, optionally selecting a unit/city there. Used by the End-Turn
 * attention list and clickable notification toasts.
 */
import { tileToPixel } from '@/engine/hex/axial';
import { HEX_SIZE } from '@/render/MapRenderer';
import { selectionSignal, sessionSignal } from './store';

export function jumpToTile(
  tileId: number,
  selection?: { unitId: number | null; cityId: number | null },
): void {
  const s = sessionSignal.peek();
  if (!s) return;
  if (selection) selectionSignal.value = selection;
  const t = s.state.map.tiles[tileId];
  if (!t) return;
  const pos = tileToPixel(t.q, t.r, HEX_SIZE);
  s.renderer?.camera.centerOn(pos.x, pos.y);
}
