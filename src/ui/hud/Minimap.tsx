/**
 * Live minimap (M1): terrain + fog at a glance, civ-colored unit dots, gold
 * viewport rectangle. Painted in offset-grid space (square cells, one per
 * tile) and cropped to the explored bounding box so the frame hugs the known
 * world and grows as you explore. Click to recenter the main camera.
 */
import { useEffect, useRef } from 'preact/hooks';
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

export function drawMinimap(canvas: HTMLCanvasElement, renderer: MapRenderer, state: GameState): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const frame = exploredFrame(state);
  const scale = Math.min(MINI_MAX / frame.cols, MINI_MAX / frame.rows);
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
  const rx = (a1.col - frame.c0) * scale;
  const ry = (a1.row - frame.r0) * scale;
  const rw = Math.max(1, (a2.col - a1.col) * scale);
  const rh = Math.max(1, (a2.row - a1.row) * scale);
  // If the whole frame fits inside the viewport, the rect conveys nothing.
  if (rx <= 0 && ry <= 0 && rx + rw >= w && ry + rh >= h) return;
  ctx.strokeStyle = '#c8a24a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(rx, ry, rw, rh);
}

export function Minimap() {
  const session = sessionSignal.value;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !session?.renderer) return;
    drawMinimap(canvas, session.renderer, session.state);
  }, [session?.version, session?.renderer]);
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
    <canvas
      ref={canvasRef}
      class="minimap-canvas"
      width={236}
      height={150}
      data-testid="minimap"
      onClick={onMiniClick}
    />
  );
}
