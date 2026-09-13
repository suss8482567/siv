/**
 * Pixi-based hex map renderer (SPEC §13). Layers bottom-up: terrain, rivers,
 * territory, fog, units, cities, overlay (selection / path / range) inside
 * the same world container. Unit/city tokens are seal-echo medallions
 * (plate ground, civ rim); resource/camp art reuses the Gilded Hex Seals.
 */
import { Application, Assets, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { buildContentDb, type ContentDb } from '@/content';
import type { GameState } from '@/engine';
import { axialToOffset, tileToPixel } from '@/engine/hex/axial';
import { HEX_DIRECTIONS, tileIndex } from '@/engine/hex/axial';
import { computeCityYields } from '@/engine/systems/economy';
import { resourceArtUrl, uiArtUrl } from '@/assets/art';
import { Camera } from './camera';
import { PALETTE } from './palette';

export const HEX_SIZE = 36;

function hexCornerPoints(s: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push(s * Math.cos(angle), s * Math.sin(angle));
  }
  return pts;
}

export interface FogData {
  explored: Set<number>;
  visible: Set<number>;
}

/** P2.1 lens paint bucket: a precomputed tile set + one tint. */
export interface LensBucket {
  tileIds: number[];
  color: string;
  alpha: number;
}

export class MapRenderer {
  readonly camera = new Camera();
  private readonly app: Application;
  private readonly world = new Container();
  private readonly terrainLayer = new Container();
  private readonly riversLayer = new Container();
  private readonly fogLayer = new Container();
  private readonly unitsLayer = new Container();
  private readonly territoryLayer = new Container();
  private readonly overlayLayer = new Container();
  private readonly cityLayer = new Container();
  private terrainSprites: Sprite[] = [];
  private riverGraphics: (Graphics | undefined)[] = [];
  private fogSprites: Sprite[] = [];
  private fogTexture: Texture | null = null;
  private resourceTextures = new Map<string, Texture>();
  private campTexture: Texture | null = null;
  private selectionRing: Graphics | null = null;
  private pathPreview: Graphics | null = null;
  private rangeOverlay: Graphics | null = null;
  private lensOverlay: Graphics | null = null;
  private disposed = false;
  private bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  private mapTiles: GameState['map']['tiles'] = [];
  private mapDims = { width: 0, height: 0 };

  private constructor(app: Application) {
    this.app = app;
  }

  /** World-space bounding box of tile centers (minimap + viewport math use this). */
  get worldBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    return this.bounds;
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  get viewSize(): { w: number; h: number } {
    return { w: this.app.screen.width, h: this.app.screen.height };
  }

  static async create(
    host: HTMLElement,
    state: GameState,
    content: ContentDb,
    fog?: FogData,
  ): Promise<MapRenderer> {
    const app = new Application();
    await app.init({ background: '#12100d', resizeTo: host, antialias: true });
    host.appendChild(app.canvas);
    const renderer = new MapRenderer(app);
    renderer.world.addChild(renderer.terrainLayer);
    renderer.world.addChild(renderer.riversLayer);
    renderer.world.addChild(renderer.territoryLayer);
    renderer.world.addChild(renderer.fogLayer);
    renderer.world.addChild(renderer.unitsLayer);
    renderer.world.addChild(renderer.cityLayer);
    renderer.world.addChild(renderer.overlayLayer);
    renderer.app.stage.addChild(renderer.world);
    await renderer.loadResourceTextures(content);
    await renderer.loadCampTexture();
    renderer.buildTerrain(state, content);
    renderer.buildRivers(state);
    if (fog) renderer.refreshFog(state, fog);
    renderer.startTicker();
    return renderer;
  }

  private startTicker(): void {
    this.app.ticker.add(() => this.applyCamera());
  }

  private applyCamera(): void {
    const viewW = this.app.screen.width;
    const viewH = this.app.screen.height;
    this.world.scale.set(this.camera.zoom);
    this.world.position.set(viewW / 2 - this.camera.x * this.camera.zoom, viewH / 2 - this.camera.y * this.camera.zoom);
  }

  /** Rasterize the "Gilded Hex Seals" resource art (docs/ART_STYLE.md) once up front. */
  private async loadResourceTextures(content: ContentDb): Promise<void> {
    for (const id of Object.keys(content.resources)) {
      const url = resourceArtUrl(id);
      if (!url) continue;
      try {
        this.resourceTextures.set(id, await Assets.load<Texture>(url));
      } catch {
        // Missing/broken asset: tile falls back to the abstract kind glyph.
      }
    }
  }

  /** Rasterize the barbarian-camp hex seal; null keeps the drawn-tents fallback. */
  private async loadCampTexture(): Promise<void> {
    const url = uiArtUrl('barbarian-camp');
    if (!url) return;
    try {
      this.campTexture = await Assets.load<Texture>(url);
    } catch {
      this.campTexture = null;
    }
  }

  /** Build the static terrain layer: one cached texture per terrain+elevation key. */
  private buildTerrain(state: GameState, content: ContentDb): void {
    const s = HEX_SIZE;
    const cache = new Map<string, Texture>();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    this.terrainSprites = new Array(state.map.tiles.length);
    for (const tile of state.map.tiles) {
      const pos = tileToPixel(tile.q, tile.r, s);
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x);
      maxY = Math.max(maxY, pos.y);
      const key = `${tile.terrain}:${tile.elevation}:${tile.features.join(',') || '-'}:${tile.resourceId ?? '-'}`;
      let tex = cache.get(key);
      if (!tex) {
        tex = this.makeHexTexture(key, content);
        cache.set(key, tex);
      }
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5, 0.5);
      sprite.position.set(pos.x, pos.y);
      this.terrainSprites[tile.id] = sprite;
      this.terrainLayer.addChild(sprite);
    }
    const pad = s * 2;
    this.bounds = { minX, minY, maxX, maxY };
    this.mapTiles = state.map.tiles;
    this.mapDims = { width: state.map.width, height: state.map.height };
    this.camera.setWorldBounds(maxX - minX + pad, maxY - minY + pad);
    // Open on the human player's position, falling back to map center.
    const humanId = state.players.find((p) => p.isHuman)?.id ?? 0;
    const anchor =
      Object.values(state.units).find((u) => u.ownerId === humanId) ??
      Object.values(state.cities).find((c) => c.ownerId === humanId);
    if (anchor) {
      const t = state.map.tiles[anchor.tileId];
      const p = tileToPixel(t.q, t.r, s);
      this.camera.centerOn(p.x, p.y);
    } else {
      this.camera.centerOn((minX + maxX) / 2, (minY + maxY) / 2);
    }
  }

  /** Per-tile river graphics (edge-hugging, fog-aware). */
  private buildRivers(state: GameState): void {
    const s = HEX_SIZE;
    this.riverGraphics = new Array(state.map.tiles.length);
    for (const tile of state.map.tiles) {
      if (!tile.riverEdges.some(Boolean)) continue;
      const g = new Graphics();
      const c = tileToPixel(tile.q, tile.r, s);
      for (let d = 0; d < 6; d++) {
        if (!tile.riverEdges[d]) continue;
        // Both sides of an edge are marked; draw each segment only once.
        if (d > 2) continue;
        // Side d of a pointy-top hex spans corners (6-d)%6 .. (7-d)%6.
        const a = hexCorner(s, (6 - d) % 6);
        const b = hexCorner(s, (7 - d) % 6);
        g.moveTo(c.x + a.x * 0.96, c.y + a.y * 0.96);
        g.lineTo(c.x + b.x * 0.96, c.y + b.y * 0.96);
      }
      g.stroke({ width: 6, color: '#3f7fae', alpha: 0.95, cap: 'round', join: 'round' });
      this.riverGraphics[tile.id] = g;
      this.riversLayer.addChild(g);
    }
  }

  /**
   * Apply 3-state fog for the viewing player: hidden tiles are removed,
   * remembered tiles sit under a dark veil, visible tiles render clean.
   */
  refreshFog(state: GameState, fog: FogData): void {
    if (this.disposed) return;
    const n = state.map.tiles.length;
    if (this.fogSprites.length !== n) {
      this.fogLayer.removeChildren().forEach((c) => c.destroy());
      if (!this.fogTexture) this.fogTexture = this.makeFogTexture();
      this.fogSprites = new Array(n);
      for (const tile of state.map.tiles) {
        const sprite = new Sprite(this.fogTexture);
        sprite.anchor.set(0.5, 0.5);
        const pos = tileToPixel(tile.q, tile.r, HEX_SIZE);
        sprite.position.set(pos.x, pos.y);
        this.fogSprites[tile.id] = sprite;
        this.fogLayer.addChild(sprite);
      }
    }
    for (const tile of state.map.tiles) {
      const terrain = this.terrainSprites[tile.id];
      const veil = this.fogSprites[tile.id];
      const river = this.riverGraphics[tile.id];
      if (!terrain || !veil) continue;
      if (river) river.visible = fog.explored.has(tile.id);
      if (!fog.explored.has(tile.id)) {
        terrain.visible = false; // never seen: nothing there
        veil.visible = false;
      } else if (!fog.visible.has(tile.id)) {
        terrain.visible = true; // remembered under fog
        veil.visible = true;
        veil.alpha = 0.55;
      } else {
        terrain.visible = true; // currently visible
        veil.visible = false;
      }
    }
  }

  private makeFogTexture(): Texture {
    const g = new Graphics();
    g.poly(hexCornerPoints(HEX_SIZE));
    g.fill({ color: '#0a0908', alpha: 1 });
    return this.app.renderer.generateTexture(g);
  }

  /**
   * Rebuild unit tokens: seal-echo medallions — plate ground with a
   * civ-colored rim (owner reads at a glance), parchment chevron for military
   * and a gold ring for civilians, HP pips under wounded tokens.
   */
  syncUnits(state: GameState, visible: Set<number>): void {
    if (this.disposed) return;
    this.unitsLayer.removeChildren().forEach((c) => c.destroy());
    const content = buildContentDb();
    const humanId = state.players.find((p) => p.isHuman)?.id ?? 0;
    const radius = HEX_SIZE * 0.42;
    for (const unit of Object.values(state.units)) {
      if (unit.ownerId !== humanId && !visible.has(unit.tileId)) continue;
      const t = state.map.tiles[unit.tileId];
      const pos = tileToPixel(t.q, t.r, HEX_SIZE);
      const g = new Graphics();
      g.circle(0, 0, radius);
      g.fill(PALETTE.plate);
      g.stroke({ width: 2.5, color: content.civs[state.players[unit.ownerId].civId]?.color ?? '#ffffff', alpha: 0.95 });
      if (unit.typeId === 'settler') {
        // Civilian marker: gold ring so non-combatants read apart.
        g.circle(0, 0, radius * 0.45);
        g.stroke({ width: 2, color: PALETTE.goldAccent, alpha: 0.95 });
      } else {
        g.moveTo(-radius * 0.4, radius * 0.3);
        g.lineTo(0, -radius * 0.42);
        g.lineTo(radius * 0.4, radius * 0.3);
        g.closePath();
        g.fill({ color: PALETTE.parchment, alpha: 0.85 });
      }
      // HP pips under wounded tokens.
      if (unit.hp < 100) {
        const w = radius * 1.7;
        const y = radius + 4;
        g.roundRect(-w / 2, y, w, 4, 2);
        g.fill({ color: PALETTE.ink, alpha: 0.75 });
        const frac = Math.max(0.04, Math.min(1, unit.hp / 100));
        g.roundRect(-w / 2, y, w * frac, 4, 2);
        g.fill(unit.hp > 50 ? '#7fbf6a' : unit.hp > 25 ? '#c8a24a' : PALETTE.dangerRed);
      }
      g.position.set(pos.x, pos.y + HEX_SIZE * 0.12);
      this.unitsLayer.addChild(g);
    }
    // Barbarian camp marker on visible tiles: "Gilded Hex Seals" stamp, with
    // the vector tents as fallback when the texture failed to load.
    for (const camp of state.barbarianCamps ?? []) {
      if (!visible.has(camp.tileId)) continue;
      const t = state.map.tiles[camp.tileId];
      const pos = tileToPixel(t.q, t.r, HEX_SIZE);
      if (this.campTexture) {
        const seal = new Sprite(this.campTexture);
        const size = HEX_SIZE * 1.1;
        seal.width = size;
        seal.height = size;
        seal.anchor.set(0.5);
        seal.position.set(pos.x, pos.y - HEX_SIZE * 0.05);
        this.unitsLayer.addChild(seal);
      } else {
        const g = new Graphics();
        g.moveTo(-HEX_SIZE * 0.24, HEX_SIZE * 0.16);
        g.lineTo(0, -HEX_SIZE * 0.26);
        g.lineTo(HEX_SIZE * 0.24, HEX_SIZE * 0.16);
        g.closePath();
        g.fill({ color: '#38312a', alpha: 0.95 });
        g.stroke({ width: 1.5, color: '#c8b89a', alpha: 0.85 });
        g.circle(0, -HEX_SIZE * 0.08, 2.5);
        g.fill(PALETTE.dangerRed);
        g.position.set(pos.x, pos.y - HEX_SIZE * 0.05);
        this.unitsLayer.addChild(g);
      }
    }
  }

  private makeHexTexture(key: string, content: ContentDb): Texture {
    const [terrainId, elevation, feature, resourceId] = key.split(':');
    const def = content.terrains[terrainId];
    const g = new Graphics();
    g.poly(hexCornerPoints(HEX_SIZE));
    g.fill(def?.color ?? '#808080');
    g.stroke({ width: 2, color: PALETTE.ink, alpha: 0.35 });
    if (elevation === 'hills') {
      g.poly(hexCornerPoints(HEX_SIZE * 0.62));
      g.fill({ color: '#000000', alpha: 0.14 });
    }
    if (elevation === 'mountain') {
      g.moveTo(-HEX_SIZE * 0.45, HEX_SIZE * 0.3);
      g.lineTo(0, -HEX_SIZE * 0.42);
      g.lineTo(HEX_SIZE * 0.45, HEX_SIZE * 0.3);
      g.closePath();
      g.fill(PALETTE.parchmentDark);
      g.stroke({ width: 1.5, color: PALETTE.ink, alpha: 0.6 });
    }
    drawFeatureGlyph(g, feature);

    // Resource seal stamped bottom-center (Civ-style); abstract kind glyph as
    // fallback when the art texture is unavailable.
    const resTex = resourceId !== '-' ? this.resourceTextures.get(resourceId) : undefined;
    if (!resTex) {
      const kind = resourceId !== '-' ? content.resources[resourceId]?.kind : undefined;
      if (kind) drawResourceGlyph(g, kind);
      return this.app.renderer.generateTexture(g);
    }
    const composed = new Container();
    composed.addChild(g);
    const seal = new Sprite(resTex);
    seal.anchor.set(0.5, 0.5);
    seal.scale.set(30 / 64);
    seal.position.set(HEX_SIZE * 0.02, HEX_SIZE * 0.28);
    composed.addChild(seal);
    return this.app.renderer.generateTexture(composed);
  }

/**
 * Territory tint + border strokes for every owned tile, plus city tokens.
 * Rebuilt wholesale after commands (cheap: a few hundred Graphics).
 */
syncTerritory(state: GameState, visible: Set<number>): void {
  if (this.disposed) return;
  this.territoryLayer.removeChildren().forEach((c) => c.destroy());
  this.cityLayer.removeChildren().forEach((c) => c.destroy());
  const content = buildContentDb();
  const humanId = state.players.find((p) => p.isHuman)?.id ?? 0;
  const s = HEX_SIZE;
  for (const tile of state.map.tiles) {
    if (tile.ownerPlayerId === undefined) continue;
    const isHuman = tile.ownerPlayerId === humanId;
    // Foreign territory stays hidden until the tile is actually visible
    // (no fog data = show everything, e.g. spectator/replay views).
    if (!isHuman && this.fogSprites.length > 0 && !visible.has(tile.id)) continue;
    const color = content.civs[state.players[tile.ownerPlayerId]?.civId ?? '']?.color ?? '#ffffff';
    const pos = tileToPixel(tile.q, tile.r, s);
    const g = new Graphics();
    // Draw everything in local space around the tile center.
    g.position.set(pos.x, pos.y);
    // Soft fill over owned ground.
    g.poly(hexCornerPoints(s * 0.98));
    g.fill({ color, alpha: isHuman ? 0.16 : 0.22 });
    // Border strokes where the neighbor is not the same owner.
    for (let d = 0; d < 6; d++) {
      const n = state.map.tiles[this.neighborId(tile.id, d)];
      if (n && n.ownerPlayerId === tile.ownerPlayerId) continue;
      const a = hexCorner(s * 0.98, (6 - d) % 6);
      const b = hexCorner(s * 0.98, (7 - d) % 6);
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
    }
    g.stroke({ width: 3, color, alpha: 0.9 });
    this.territoryLayer.addChild(g);
  }
  // City tokens: hex-plate medallions echoing the map grid and the seal
  // frames — plate ground, civ-colored rim, parchment heart (star = palace).
  for (const city of Object.values(state.cities)) {
    const t = state.map.tiles[city.tileId];
    const isHuman = city.ownerId === humanId;
    if (!isHuman && !visible.has(city.tileId)) continue;
    const color = content.civs[state.players[city.ownerId]?.civId ?? '']?.color ?? '#ffffff';
    const pos = tileToPixel(t.q, t.r, s);
    const g = new Graphics();
    g.poly(hexCornerPoints(s * 0.34));
    g.fill({ color: PALETTE.plate, alpha: 0.95 });
    g.stroke({ width: 2, color, alpha: 0.95 });
    if (city.buildings.includes('palace')) {
      g.star(0, -s * 0.42, 5, s * 0.12, s * 0.05);
      g.fill({ color: PALETTE.parchment, alpha: 0.95 });
    }
    g.circle(0, -s * 0.1, s * 0.08);
    g.fill({ color: PALETTE.parchment, alpha: 0.9 });
    g.position.set(pos.x, pos.y);
    this.cityLayer.addChild(g);
  }
  // City banners (Civ VI pattern): name · pop above every visible city, with
  // the human's live build + ETA on a second line — the city is the most
  // inspected object on the map and must read without opening any panel.
  for (const city of Object.values(state.cities)) {
    const t = state.map.tiles[city.tileId];
    const isHuman = city.ownerId === humanId;
    if (!isHuman && !visible.has(city.tileId)) continue;
    const color = content.civs[state.players[city.ownerId]?.civId ?? '']?.color ?? '#ffffff';
    const pos = tileToPixel(t.q, t.r, s);
    const banner = this.makeCityBanner(state, content, city, color, isHuman);
    banner.position.set(pos.x, pos.y - s * 0.6);
    this.cityLayer.addChild(banner);
  }
}

/**
 * Banner plate for one city: parchment serif text on a plate ground with a
 * civ-colored rim (echoes the token + seal frames). `eta` line is human-only:
 * current build with a turns-to-go estimate, or an idle blocker.
 */
private makeCityBanner(
  state: GameState,
  content: ContentDb,
  city: GameState['cities'][number],
  color: string,
  isHuman: boolean,
): Container {
  const box = new Container();
  const style = {
    fontFamily: 'Georgia, "Times New Roman", serif',
    fill: PALETTE.parchment,
    letterSpacing: 0.5,
  };
  const name = new Text({ text: `${city.name} · ${city.population}`, style: { ...style, fontSize: 12 } });
  name.anchor.set(0.5, 0.5);

  let eta: Text | null = null;
  if (isHuman) {
    const item = city.productionQueue[0];
    if (item) {
      const def = item.kind === 'unit' ? content.units[item.id] : content.buildings[item.id];
      const perTurn = computeCityYields(state, city).production;
      const left = Math.max(0, (def?.cost ?? 0) - city.productionStored);
      const turns = perTurn > 0 ? Math.ceil(left / perTurn) : Infinity;
      eta = new Text({
        text: `${def?.name ?? item.id} · ${Number.isFinite(turns) ? `${turns}t` : 'stalled'}`,
        style: { ...style, fontSize: 10, fill: PALETTE.parchmentDark },
      });
    } else {
      eta = new Text({
        text: 'idle — pick production',
        style: { ...style, fontSize: 10, fill: PALETTE.goldAccent },
      });
    }
    eta.anchor.set(0.5, 0.5);
    eta.position.set(0, 9);
  }

  const g = new Graphics();
  const w = Math.max(name.width, eta?.width ?? 0) + 16;
  const h = eta ? 33 : 20;
  name.position.set(0, eta ? -7 : 0);
  g.roundRect(-w / 2, -h / 2, w, h, 5);
  g.fill({ color: PALETTE.plate, alpha: 0.92 });
  g.stroke({ width: 1.5, color, alpha: 0.95 });
  box.addChild(g);
  box.addChild(name);
  if (eta) box.addChild(eta);
  return box;
}

/** Tile id in direction d from tileId, or -1. */
private neighborId(tileId: number, d: number): number {
  const t = this.mapTiles[tileId];
  if (!t) return -1;
  const n = HEX_DIRECTIONS[d];
  return tileIndex(t.q + n.q, t.r + n.r, this.mapDims.width, this.mapDims.height);
}

/** Gold selection ring under the selected unit/city; -1 clears. */
setSelection(tileId: number): void {
  if (this.disposed) return;
  if (this.selectionRing) {
    this.selectionRing.destroy();
    this.selectionRing = null;
  }
  if (tileId < 0) return;
  const t = this.mapTiles[tileId];
  if (!t) return;
  const pos = tileToPixel(t.q, t.r, HEX_SIZE);
  const g = new Graphics();
  g.poly(hexCornerPoints(HEX_SIZE * 0.92));
  g.stroke({ width: 3.5, color: PALETTE.goldAccent, alpha: 0.95 });
  g.position.set(pos.x, pos.y);
  this.selectionRing = g;
  this.overlayLayer.addChild(g);
}

/** Dashed route dots for the pending move; empty array clears. */
setPathPreview(tileIds: number[]): void {
  if (this.disposed) return;
  if (this.pathPreview) {
    this.pathPreview.destroy();
    this.pathPreview = null;
  }
  if (tileIds.length === 0) return;
  const g = new Graphics();
  for (const id of tileIds) {
    const t = this.mapTiles[id];
    if (!t) continue;
    const pos = tileToPixel(t.q, t.r, HEX_SIZE);
    g.circle(pos.x, pos.y, HEX_SIZE * 0.12);
    g.fill({ color: PALETTE.goldAccent, alpha: 0.85 });
  }
  this.pathPreview = g;
  this.overlayLayer.addChild(g);
}

/**
 * Translucent move-range shading under the selected unit: gold = reachable
 * this turn, pale parchment = full reach next turn. Null/empty clears.
 */
setRangeOverlay(reachNow: Iterable<number> | null, reachNext?: Iterable<number>): void {
  if (this.disposed) return;
  if (this.rangeOverlay) {
    this.rangeOverlay.destroy();
    this.rangeOverlay = null;
  }
  const now = reachNow ? [...reachNow] : [];
  const next = reachNext ? [...reachNext] : [];
  if (now.length === 0 && next.length === 0) return;

  const pts = hexCornerPoints(HEX_SIZE * 0.95);
  const g = new Graphics();
  const paint = (ids: number[], color: string, alpha: number): void => {
    for (const id of ids) {
      const t = this.mapTiles[id];
      if (!t) continue;
      const pos = tileToPixel(t.q, t.r, HEX_SIZE);
      const abs: number[] = [];
      for (let i = 0; i < pts.length; i += 2) abs.push(pos.x + pts[i], pos.y + pts[i + 1]);
      g.poly(abs);
      g.fill({ color, alpha });
    }
  };
  paint(next, PALETTE.parchment, 0.13); // next-turn ring sits underneath
  paint(now, PALETTE.goldAccent, 0.22);
  this.rangeOverlay = g;
  this.overlayLayer.addChild(g);
}

  /**
   * P2.1 lens overlay: paint precomputed tile buckets (tints/highlights in
   * the setRangeOverlay style). Buckets are computed once per activation by
   * the caller — never per frame. Null/empty clears.
   */
  setLensOverlay(buckets: LensBucket[] | null): void {
    if (this.disposed) return;
    if (this.lensOverlay) {
      this.lensOverlay.destroy();
      this.lensOverlay = null;
    }
    const list = buckets ?? [];
    if (list.length === 0) return;
    const pts = hexCornerPoints(HEX_SIZE * 0.95);
    const g = new Graphics();
    for (const bucket of list) {
      for (const id of bucket.tileIds) {
        const t = this.mapTiles[id];
        if (!t) continue;
        const pos = tileToPixel(t.q, t.r, HEX_SIZE);
        const abs: number[] = [];
        for (let i = 0; i < pts.length; i += 2) abs.push(pos.x + pts[i], pos.y + pts[i + 1]);
        g.poly(abs);
        g.fill({ color: bucket.color, alpha: bucket.alpha });
      }
    }
    this.lensOverlay = g;
    this.overlayLayer.addChild(g);
  }

  destroy(): void {
    this.disposed = true;
    this.app.destroy(true);
  }

  /** Render-loop hook for HUD widgets that must track the camera (minimap viewport rect). */
  addTickCallback(cb: () => void): void {
    this.app.ticker.add(cb);
  }

  removeTickCallback(cb: () => void): void {
    this.app.ticker.remove(cb);
  }
}

/** Vector-tabletop feature glyphs, kept subtle so terrain stays readable. */
function drawFeatureGlyph(g: Graphics, feature: string): void {
  const s = HEX_SIZE;
  switch (feature) {
    case 'forest':
      for (const [dx, dy] of [[-0.28, -0.18], [0.26, -0.1], [-0.02, 0.24]] as const) {
        g.moveTo(dx * s, dy * s + s * 0.22);
        g.lineTo(dx * s, dy * s - s * 0.22);
        g.lineTo(dx * s + s * 0.18, dy * s + s * 0.1);
        g.closePath();
        g.fill({ color: '#2f4a2a', alpha: 0.85 });
      }
      break;
    case 'jungle':
      for (const [dx, dy] of [[-0.25, -0.2], [0.22, -0.15], [-0.05, 0.12], [0.12, 0.3]] as const) {
        g.circle(dx * s, dy * s, s * 0.13);
        g.fill({ color: '#1e4020', alpha: 0.85 });
      }
      break;
    case 'marsh':
      for (const dy of [-0.18, 0.08]) {
        g.moveTo(-s * 0.32, dy * s);
        g.quadraticCurveTo(0, (dy + 0.12) * s, s * 0.32, dy * s);
        g.stroke({ width: 2.5, color: '#4a7a6a', alpha: 0.8 });
      }
      break;
    case 'ice':
      g.poly([-s * 0.35, s * 0.1, -s * 0.1, -s * 0.25, s * 0.2, -s * 0.05, s * 0.32, s * 0.22]);
      g.fill({ color: '#eef4f6', alpha: 0.75 });
      break;
    case 'oasis':
      g.ellipse(0, 0, s * 0.26, s * 0.16);
      g.fill({ color: '#3f7fae', alpha: 0.9 });
      break;
    case 'floodplain':
      for (const dy of [-0.2, 0.05, 0.3]) {
        g.moveTo(-s * 0.3, dy * s);
        g.lineTo(s * 0.3, dy * s);
        g.stroke({ width: 2, color: '#b59a55', alpha: 0.5 });
      }
      break;
    default:
      break;
  }
}

/** Resource markers: gold diamond (luxury), steel square (strategic), green pip (bonus). */
function drawResourceGlyph(g: Graphics, kind: string): void {
  const s = HEX_SIZE * 0.14;
  switch (kind) {
    case 'luxury':
      g.poly([0, -s * 1.2, s, 0, 0, s * 1.2, -s, 0]);
      g.fill({ color: '#c8a24a', alpha: 0.95 });
      g.stroke({ width: 1, color: '#2a2418', alpha: 0.7 });
      break;
    case 'strategic':
      g.rect(-s * 0.9, -s * 0.9, s * 1.8, s * 1.8);
      g.fill({ color: '#8a8fa8', alpha: 0.95 });
      g.stroke({ width: 1, color: '#2a2418', alpha: 0.7 });
      break;
    case 'bonus':
      g.circle(0, 0, s);
      g.fill({ color: '#7fbf6a', alpha: 0.95 });
      g.stroke({ width: 1, color: '#2a2418', alpha: 0.7 });
      break;
    default:
      break;
  }
}

/** Corner point of a pointy-top hex at corner index i (angle 60*i - 30). */
function hexCorner(s: number, i: number): { x: number; y: number } {
  const angle = (Math.PI / 180) * (60 * i - 30);
  return { x: s * Math.cos(angle), y: s * Math.sin(angle) };
}
