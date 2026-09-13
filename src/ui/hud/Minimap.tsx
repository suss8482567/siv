/**
 * Live minimap (M1): terrain + fog at a glance, civ-colored unit dots, gold
 * viewport rectangle. Painted in offset-grid space (square cells, one per
 * tile) and cropped to the explored bounding box so the frame hugs the known
 * world and grows as you explore. Click to recenter the main camera.
 */
import { useEffect, useRef } from 'preact/hooks';
import { signal } from '@preact/signals';
import { buildContentDb, TERRAINS } from '@/content';
import type { GameState } from '@/engine';
import { HEX_SIZE } from '@/render/MapRenderer';
import type { MapRenderer } from '@/render/MapRenderer';
import { computeVisibleTiles } from '@/engine/systems/visibility';
import { sessionSignal } from '../store';

const TERRAIN_COLOR: Record<string, string> = Object.fromEntries(
  TERRAINS.map((t) => [t.id, t.color]),
);
const MINI_MAX = 240;
const MINI_MIN = 3; // explored bbox margin, in cells

/** P2.7 minimap options (UI-only, localStorage-persisted). */
export type MinimapSize = 'S' | 'L';
export const MINIMAP_STORAGE_SIZE_KEY = 'siv.minimap.size';
export const MINIMAP_STORAGE_TERRITORY_KEY = 'siv.minimap.territory';
export const MINIMAP_MAX_S = 150;
export const MINIMAP_MAX_L = 240;

function loadMinimapSize(): MinimapSize {
  try {
    if (typeof localStorage === 'undefined') return 'L';
    return localStorage.getItem(MINIMAP_STORAGE_SIZE_KEY) === 'S' ? 'S' : 'L';
  } catch {
    return 'L';
  }
}

function loadMinimapTerritory(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(MINIMAP_STORAGE_TERRITORY_KEY) === '1';
  } catch {
    return false;
  }
}

export const minimapSizeSignal = signal<MinimapSize>(loadMinimapSize());
export const minimapTerritorySignal = signal<boolean>(loadMinimapTerritory());

export function setMinimapSize(next: MinimapSize): void {
  minimapSizeSignal.value = next;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(MINIMAP_STORAGE_SIZE_KEY, next);
  } catch {
    // Private-mode writes fail silently; the in-memory signal still holds.
  }
}

export function toggleMinimapSize(): void {
  setMinimapSize(minimapSizeSignal.value === 'S' ? 'L' : 'S');
}

export function setMinimapTerritory(on: boolean): void {
  minimapTerritorySignal.value = on;
  try {
    if (typeof localStorage === 'undefined') return;
    if (on) localStorage.setItem(MINIMAP_STORAGE_TERRITORY_KEY, '1');
    else localStorage.removeItem(MINIMAP_STORAGE_TERRITORY_KEY);
  } catch {
    // Private-mode writes fail silently; the in-memory signal still holds.
  }
}

export function toggleMinimapTerritory(): void {
  setMinimapTerritory(!minimapTerritorySignal.value);
}

export interface MinimapOptions {
  maxSize?: number;
  showTerritory?: boolean;
}

/** Explored bbox in offset-grid cells, padded, clamped to the map. */
function exploredFrame(state: GameState): { c0: number; r0: number; cols: number; rows: number } {
  const humanId = state.players.find((p) => p.isHuman)?.id ?? 0;
  const explored = state.players[humanId].exploredTileIds;
  let minC = Infinity, minR = Infinity, maxC = -Infinity, maxR = -Infinity;
  for (const id of explored) {
    const t = state.map.tiles[id];
    const col = t.q + ((t.r - (t.r & 1)) >> 1);
    minC = Math.min(minC, col); maxC = Math.max(maxC, col);
    minR = Math.min(minR, t.r); maxR = Math.max(maxR, t.r);
  }
  if (!Number.isFinite(minC)) { minC = 0; minR = 0; maxC = 0; maxR = 0; }
  const c0 = Math.max(0, minC - MINI_MIN);
  const r0 = Math.max(0, minR - MINI_MIN);
  const cols = Math.min(
    state.map.width - c0,
    maxC - minC + 1 + 2 * MINI_MIN,
  );
  const rows = Math.min(
    state.map.height - r0,
    maxR - minR + 1 + 2 * MINI_MIN,
  );
  return { c0, r0, cols: Math.max(1, cols), rows: Math.max(1, rows) };
}

export function drawMinimap(
  canvas: HTMLCanvasElement,
  renderer: MapRenderer,
  state: GameState,
  opts?: MinimapOptions,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const frame = exploredFrame(state);
  const miniMax = opts?.maxSize ?? MINI_MAX;
  const scale = Math.min(miniMax / frame.cols, miniMax / frame.rows);
  const w = Math.max(1, Math.round(frame.cols * scale));
  const h = Math.max(1, Math.round(frame.rows * scale));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.fillStyle = '#0a0908';
  ctx.fillRect(0, 0, w, h);
  const cell = Math.ceil(scale);
  const toMini = (col: number, row: number) => ({
    x: (col - frame.c0) * scale,
    y: (row - frame.r0) * scale,
  });
  const humanId = state.players.find((p) => p.isHuman)?.id ?? 0;
  const visible = computeVisibleTiles(state, humanId);
  const exploredSet = new Set(state.players[humanId].exploredTileIds);
  for (const tile of state.map.tiles) {
    if (!exploredSet.has(tile.id)) continue;
    const col = tile.q + ((tile.r - (tile.r & 1)) >> 1);
    const { x, y } = toMini(col, tile.r);
    ctx.fillStyle = TERRAIN_COLOR[tile.terrain] ?? '#666';
    ctx.fillRect(x, y, cell, cell);
    if (cell >= 6 && tile.riverEdges.some(Boolean)) {
      ctx.fillStyle = '#3f7fae';
      ctx.fillRect(x + cell / 2 - 1.5, y + cell / 2 - 1.5, 3, 3);
    }
    if (!visible.has(tile.id)) {
      ctx.fillStyle = 'rgba(10,9,8,0.45)';
      ctx.fillRect(x, y, cell, cell);
    }
  }
  // Unit dots: own always, enemies only while visible.
  const content = buildContentDb();
  // Territory shading (P2.7 option): civ-colored wash under the dots, with
  // the same fog courtesy as the main map (foreign land only while visible).
  if (opts?.showTerritory) {
    ctx.save();
    ctx.globalAlpha = 0.38;
    for (const tile of state.map.tiles) {
      if (tile.ownerPlayerId === undefined || !exploredSet.has(tile.id)) continue;
      if (tile.ownerPlayerId !== humanId && !visible.has(tile.id)) continue;
      const col = tile.q + ((tile.r - (tile.r & 1)) >> 1);
      const { x, y } = toMini(col, tile.r);
      ctx.fillStyle = content.civs[state.players[tile.ownerPlayerId]?.civId ?? '']?.color ?? '#ffffff';
      ctx.fillRect(x, y, cell, cell);
    }
    ctx.restore();
  }
  const dot = Math.max(2, Math.round(cell * 0.55));
  for (const unit of Object.values(state.units)) {
    if (unit.ownerId !== humanId && !visible.has(unit.tileId)) continue;
    const t = state.map.tiles[unit.tileId];
    const col = t.q + ((t.r - (t.r & 1)) >> 1);
    const { x, y } = toMini(col, t.r);
    const civ = content.civs[state.players[unit.ownerId].civId];
    ctx.fillStyle = civ?.color ?? '#fff';
    ctx.fillRect(x + cell / 2 - dot / 2, y + cell / 2 - dot / 2, dot, dot);
  }
  // Viewport rectangle: camera world corners -> offset-grid floats (linear
  // approximation through the hex stagger, good to ~1/4 tile).
  const b = renderer.worldBounds;
  const { w: viewW, h: viewH } = renderer.viewSize;
  const cam = renderer.camera;
  const s = HEX_SIZE;
  const toOffset = (wx: number, wy: number) => ({
    col: wx / (Math.sqrt(3) * s) - 0.25,
    row: wy / (1.5 * s),
  });
  const a1 = toOffset(cam.x - viewW / (2 * cam.zoom), cam.y - viewH / (2 * cam.zoom));
  const a2 = toOffset(cam.x + viewW / (2 * cam.zoom), cam.y + viewH / (2 * cam.zoom));
  const rx0 = (a1.col - frame.c0) * scale;
  const ry0 = (a1.row - frame.r0) * scale;
  const rw0 = Math.max(1, (a2.col - a1.col) * scale);
  const rh0 = Math.max(1, (a2.row - a1.row) * scale);
  // Clamp to the canvas — a viewport much larger than the known world would
  // otherwise smear its edges across the minimap as full-width lines.
  const rx = Math.max(0, rx0);
  const ry = Math.max(0, ry0);
  const rw = Math.min(w, rx0 + rw0) - rx;
  const rh = Math.min(h, ry0 + rh0) - ry;
  if (rw <= 0 || rh <= 0) return;
  // When the (clamped) rect covers ~the whole frame, the viewport wraps
  // everything explored and the rectangle conveys nothing.
  if (rw * rh >= 0.9 * w * h) return;
  ctx.strokeStyle = '#c8a24a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(rx, ry, rw, rh);
}

export function Minimap() {
  const session = sessionSignal.value;
  const size = minimapSizeSignal.value;
  const showTerritory = minimapTerritorySignal.value;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const s = session;
    if (!canvas || !s?.renderer) return;
    const renderer = s.renderer;
    const draw = () =>
      drawMinimap(canvas, renderer, s.state, {
        maxSize: minimapSizeSignal.peek() === 'S' ? MINIMAP_MAX_S : MINIMAP_MAX_L,
        showTerritory: minimapTerritorySignal.peek(),
      });
    draw();
    // The viewport rectangle must track the camera between commands (Civ VI
    // pattern): redraw on the render ticker, throttled to ~10 fps and only
    // when the camera actually moved.
    let lastX = renderer.camera.x;
    let lastY = renderer.camera.y;
    let lastZoom = renderer.camera.zoom;
    let lastDraw = 0;
    const cb = () => {
      const c = renderer.camera;
      if (c.x === lastX && c.y === lastY && c.zoom === lastZoom) return;
      const now = performance.now();
      if (now - lastDraw < 100) return;
      lastX = c.x;
      lastY = c.y;
      lastZoom = c.zoom;
      lastDraw = now;
      draw();
    };
    renderer.addTickCallback(cb);
    return () => renderer.removeTickCallback(cb);
  }, [session?.version, session?.renderer, size, showTerritory]);
  if (!session?.renderer) return <div class="minimap-placeholder">Minimap…</div>;
  const renderer = session.renderer;
  const onMiniClick = (e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const frame = exploredFrame(session.state);
    const col = ((e.clientX - rect.left) / rect.width) * frame.cols + frame.c0;
    const row = ((e.clientY - rect.top) / rect.height) * frame.rows + frame.r0;
    const s = HEX_SIZE;
    renderer.camera.centerOn((col + 0.25) * Math.sqrt(3) * s, row * 1.5 * s);
  };
  return (
    <div class="minimap-wrap">
      <div class="minimap-options">
        <button
          class="mini-opt-btn"
          data-testid="minimap-size"
          title="Toggle minimap size (S/L)"
          onClick={() => toggleMinimapSize()}
        >
          {size === 'S' ? 'Size: S' : 'Size: L'}
        </button>
        <button
          class="mini-opt-btn"
          data-testid="minimap-territory"
          title="Toggle territory shading on the minimap"
          aria-pressed={showTerritory}
          onClick={() => toggleMinimapTerritory()}
        >
          {showTerritory ? 'Territory: On' : 'Territory: Off'}
        </button>
      </div>
      <canvas
        ref={canvasRef}
        class="minimap-canvas"
        width={236}
        height={150}
        data-testid="minimap"
        onClick={onMiniClick}
      />
    </div>
  );
}
