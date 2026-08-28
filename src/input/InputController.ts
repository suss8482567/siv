/**
 * Converts DOM events on the map canvas into camera ops and game intents.
 * M0 scope: drag/WASD pan, wheel zoom, tile click reporting.
 * Selection, path preview and command intents arrive in M2 (SPEC §14).
 */
import { pixelToTile } from '@/engine';
import { HEX_SIZE, type MapRenderer } from '@/render/MapRenderer';

export interface MapDimensions {
  width: number;
  height: number;
}

export interface InputCallbacks {
  onTileClick?: (tileId: number) => void;
  onTileRightClick?: (tileId: number) => void;
  /** RMB press/release, for hold-to-show move range shading. */
  onRightButtonDown?: () => void;
  onRightButtonUp?: () => void;
  /** Pointer rests on a tile (viewport coords); null once it leaves the map. */
  onTileHover?: (hover: { tileId: number; x: number; y: number } | null) => void;
}

export class InputController {
  private readonly canvas: HTMLCanvasElement;
  private dragging = false;
  private dragMoved = false;
  private lastX = 0;
  private lastY = 0;
  private hoverTileId = -1;

  constructor(
    private readonly renderer: MapRenderer,
    private readonly mapDims: MapDimensions,
    private readonly callbacks: InputCallbacks = {},
  ) {
    this.canvas = renderer.canvas;
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.canvas.addEventListener('pointermove', this.onCanvasPointerMove);
    this.canvas.addEventListener('pointerleave', this.onCanvasPointerLeave);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
  }

  detach(): void {
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('pointermove', this.onCanvasPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onCanvasPointerLeave);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private get viewW(): number {
    return this.canvas.clientWidth;
  }

  private get viewH(): number {
    return this.canvas.clientHeight;
  }

  /** Screen point -> tile id, or -1 when off-map. */
  screenToTileId(sx: number, sy: number): number {
    const cam = this.renderer.camera;
    const { wx, wy } = cam.screenToWorld(sx, sy, this.viewW, this.viewH);
    const a = pixelToTile(wx, wy, HEX_SIZE);
    const col = a.q + ((a.r - (a.r & 1)) >> 1);
    const row = a.r;
    if (col < 0 || col >= this.mapDims.width || row < 0 || row >= this.mapDims.height) return -1;
    return row * this.mapDims.width + col;
  }

  private localPoint(e: PointerEvent | WheelEvent | MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    const p = this.localPoint(e);
    const tileId = this.screenToTileId(p.x, p.y);
    if (tileId >= 0) this.callbacks.onTileRightClick?.(tileId);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const p = this.localPoint(e);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    this.renderer.camera.zoomAt(factor, p.x, p.y, this.viewW, this.viewH);
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) {
      if (e.button === 2) this.callbacks.onRightButtonDown?.();
      return;
    }
    this.callbacks.onTileHover?.(null); // drag starting: hide the hover tooltip
    const p = this.localPoint(e);
    this.dragging = true;
    this.dragMoved = false;
    this.lastX = p.x;
    this.lastY = p.y;
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const p = this.localPoint(e);
    const dx = p.x - this.lastX;
    const dy = p.y - this.lastY;
    if (!this.dragMoved && Math.hypot(dx, dy) < 4) return;
    this.dragMoved = true;
    this.lastX = p.x;
    this.lastY = p.y;
    this.renderer.camera.panBy(-dx / this.renderer.camera.zoom, -dy / this.renderer.camera.zoom);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.button !== 0) {
      if (e.button === 2) this.callbacks.onRightButtonUp?.();
      return;
    }
    if (!this.dragging) return;
    this.dragging = false;
    if (this.dragMoved) return;
    const p = this.localPoint(e);
    const tileId = this.screenToTileId(p.x, p.y);
    if (tileId >= 0) this.callbacks.onTileClick?.(tileId);
  };

  /** Hover tracking: fire on tile change only, never while dragging. */
  private onCanvasPointerMove = (e: PointerEvent): void => {
    if (this.dragging) return;
    const p = this.localPoint(e);
    const tileId = this.screenToTileId(p.x, p.y);
    if (tileId === this.hoverTileId) return;
    this.hoverTileId = tileId;
    if (tileId < 0) this.callbacks.onTileHover?.(null);
    else this.callbacks.onTileHover?.({ tileId, x: e.clientX, y: e.clientY });
  };

  private onCanvasPointerLeave = (): void => {
    if (this.hoverTileId < 0) return;
    this.hoverTileId = -1;
    this.callbacks.onTileHover?.(null);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const step = 60;
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
        this.renderer.camera.panBy(-step, 0);
        break;
      case 'ArrowRight':
      case 'd':
        this.renderer.camera.panBy(step, 0);
        break;
      case 'ArrowUp':
      case 'w':
        this.renderer.camera.panBy(0, -step);
        break;
      case 'ArrowDown':
      case 's':
        this.renderer.camera.panBy(0, step);
        break;
    }
  };
}
