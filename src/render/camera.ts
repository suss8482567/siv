/**
 * Pan/zoom camera with world<->screen transforms and bounds clamping.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  readonly minZoom = 0.4;
  readonly maxZoom = 2.5;
  private worldWidth = 0;
  private worldHeight = 0;

  setWorldBounds(widthPx: number, heightPx: number): void {
    this.worldWidth = widthPx;
    this.worldHeight = heightPx;
    this.clamp();
  }

  panBy(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this.clamp();
  }

  /** Zoom keeping the world point under (screenX, screenY) visually stable. */
  zoomAt(factor: number, screenX: number, screenY: number, viewW: number, viewH: number): void {
    const next = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    if (next === this.zoom) return;
    const wx = (screenX - viewW / 2) / this.zoom + this.x;
    const wy = (screenY - viewH / 2) / this.zoom + this.y;
    this.zoom = next;
    this.x = wx - (screenX - viewW / 2) / this.zoom;
    this.y = wy - (screenY - viewH / 2) / this.zoom;
    this.clamp();
  }

  centerOn(wx: number, wy: number): void {
    this.x = wx;
    this.y = wy;
    this.clamp();
  }

  worldToScreen(wx: number, wy: number, viewW: number, viewH: number): { sx: number; sy: number } {
    return {
      sx: (wx - this.x) * this.zoom + viewW / 2,
      sy: (wy - this.y) * this.zoom + viewH / 2,
    };
  }

  screenToWorld(sx: number, sy: number, viewW: number, viewH: number): { wx: number; wy: number } {
    return {
      wx: (sx - viewW / 2) / this.zoom + this.x,
      wy: (sy - viewH / 2) / this.zoom + this.y,
    };
  }

  private clamp(): void {
    if (this.worldWidth <= 0 || this.worldHeight <= 0) return;
    const margin = 120;
    this.x = Math.min(Math.max(this.x, -margin), this.worldWidth + margin);
    this.y = Math.min(Math.max(this.y, -margin), this.worldHeight + margin);
  }
}
