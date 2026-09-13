/**
 * M1 population passes: terrain features, resources (with start guarantees),
 * and scored start placement. All deterministic via the passed Rng.
 */
import { Rng } from '../core/rng';
import type { Tile } from '../core/types';
import { axialToOffset, hexDistance, tilesInRange } from '../hex/axial';
import type { ContentDb, ResourceDef } from '../../content';


export function placeFeatures(
  tiles: Tile[],
  moisture: Float32Array,
  width: number,
  heightRows: number,
  rng: Rng,
): void {
  const centerRow = (heightRows - 1) / 2;
  for (const t of tiles) {
    if (t.terrain === 'ocean' || t.elevation === 'mountain') continue;
    const { col, row } = axialToOffset(t.q, t.r);
    const band = Math.abs(row - centerRow) / (centerRow || 1);
    const m = moisture[t.id];
    const hasRiver = t.riverEdges.some(Boolean);
    if (hasFeature(t)) continue;
    // Equatorial jungle belt.
    if (band < 0.34 && m > 0.55 && (t.terrain === 'grassland' || t.terrain === 'plains')) {
      if (rng.chance(0.5)) {
        t.features.push('jungle');
        continue;
      }
    }
    // Temperate + boreal forest.
    if (
      m > 0.5 &&
      (t.terrain === 'grassland' || t.terrain === 'plains' || t.terrain === 'tundra')
    ) {
      if (rng.chance(0.42)) {
        t.features.push('forest');
        continue;
      }
    }
    // Marsh: wet flat grassland, often near rivers.
    if (t.terrain === 'grassland' && t.elevation === 'flat' && m > 0.72) {
      if (hasRiver && rng.chance(0.45)) {
        t.features.push('marsh');
        continue;
      }
      if (rng.chance(0.12)) {
        t.features.push('marsh');
        continue;
      }
    }
    // Desert specials: floodplain along rivers, rare oases.
    if (t.terrain === 'desert') {
      if (hasRiver) {
        t.features.push('floodplain');
        continue;
      }
      if (rng.chance(0.02)) t.features.push('oasis');
    }
  }
  // Polar sea ice.
  for (const t of tiles) {
    if (t.terrain !== 'ocean' && t.terrain !== 'coast') continue;
    const { row } = axialToOffset(t.q, t.r);
    const band = Math.abs(row - centerRow) / (centerRow || 1);
    if (band > 0.86 && rng.chance(0.55)) t.features.push('ice');
  }
}

function hasFeature(t: Tile): boolean {
  return t.features.length > 0;
}

const KIND_DENSITY: Record<ResourceDef['kind'], number> = {
  bonus: 0.075,
  luxury: 0.05,
  strategic: 0.032,
};

export function placeResources(
  tiles: Tile[],
  content: ContentDb,
  rng: Rng,
  starts: number[],
): void {
  const all = Object.values(content.resources);
  for (const t of tiles) {
    if (t.resourceId) continue;
    if (t.elevation === 'mountain') continue;
    const isWater = t.terrain === 'ocean' || t.terrain === 'coast';
    if (isWater && t.terrain === 'ocean') continue; // fish only on coast
    if (t.features.includes('ice') || t.features.includes('oasis')) continue;
    const candidates = all.filter((r) => r.terrains.includes(t.terrain));
    if (candidates.length === 0) continue;
    let density = 0;
    for (const c of candidates) density = Math.max(density, KIND_DENSITY[c.kind]);
    if (!rng.chance(density)) continue;
    const def = weightedPick(candidates, rng);
    applyResource(t, def, rng);
  }

}

function weightedPick(cands: ResourceDef[], rng: Rng): ResourceDef {
  const total = cands.reduce((s, c) => s + c.spawnWeight, 0);
  let roll = rng.float() * total;
  for (const c of cands) {
    roll -= c.spawnWeight;
    if (roll <= 0) return c;
  }
  return cands[cands.length - 1];
}

function applyResource(t: Tile, def: ResourceDef, rng: Rng): void {
  t.resourceId = def.id;
  if (def.kind === 'strategic') {
    t.resourceAmount = rng.int(def.amountMin, def.amountMax);
  }
}


/** Every capital needs at least one luxury within 2 and one strategic within 3. */
export function guaranteeStartResources(
  tiles: Tile[],
  content: ContentDb,
  rng: Rng,
  width: number,
  heightRows: number,
  starts: number[],
): void {
  for (const start of starts) {
    ensureKind(tiles, content, rng, tiles[start], 'luxury', 2, width, heightRows);
    ensureKind(tiles, content, rng, tiles[start], 'strategic', 3, width, heightRows);
  }
}

function ensureKind(
  tiles: Tile[],
  content: ContentDb,
  rng: Rng,
  center: Tile,
  kind: ResourceDef['kind'],
  radius: number,
  width: number,
  heightRows: number,
): void {
  const all = Object.values(content.resources);
  for (const t of tilesInRange(center.q, center.r, radius)) {
    const idx = offsetIndex(t.q, t.r, width, heightRows);
    if (idx < 0) continue;
    const rid = tiles[idx].resourceId;
    if (rid && content.resources[rid]?.kind === kind) return; // already satisfied
  }
  // Force-place on the first suitable empty tile in range.
  for (const t of tilesInRange(center.q, center.r, radius)) {
    const idx = offsetIndex(t.q, t.r, width, heightRows);
    if (idx < 0) continue;
    const tile = tiles[idx];
    if (tile.resourceId) continue;
    if (tile.terrain === 'ocean' || tile.elevation === 'mountain') continue;
    if (tile.features.includes('ice') || tile.features.includes('oasis')) continue;
    const cands = all.filter((r) => r.kind === kind && r.terrains.includes(tile.terrain));
    if (cands.length > 0) {
      applyResource(tile, rng.pick(cands), rng);
      return;
    }
  }
}

function offsetIndex(q: number, r: number, width: number, heightRows: number): number {
  const { col, row } = axialToOffset(q, r);
  if (col < 0 || col >= width || row < 0 || row >= heightRows) return -1;
  return row * width + col;
}

/** Heuristic city-site score over radius 2: yields, fresh water, coast, resources. */
export function scoreStartTile(
  tiles: Tile[],
  idx: number,
  width: number,
  heightRows: number,
): number {
  const c = tiles[idx];
  let s = 0;
  for (const t of tilesInRange(c.q, c.r, 2)) {
    const i2 = offsetIndex(t.q, t.r, width, heightRows);
    if (i2 < 0) continue;
    const tl = tiles[i2];
    const dist = hexDistance(c.q, c.r, t.q, t.r);
    if (tl.terrain === 'ocean') {
      s -= 0.5;
      continue;
    }
    if (tl.terrain === 'coast') {
      s += dist <= 1 ? 1.5 : 0.3; // coastal access is valuable up close
      continue;
    }
    switch (tl.terrain) {
      case 'grassland': s += 2.2; break;
      case 'plains': s += 1.8; break;
      case 'desert': s += 0.2; break;
      case 'tundra': s += 0.8; break;
      default: break; // snow
    }
    if (tl.elevation === 'hills') s += 0.8;
    if (tl.features.includes('forest') || tl.features.includes('jungle')) s += 0.4;
    if (tl.features.includes('marsh')) s -= 0.8;
    if (tl.features.includes('oasis')) s += 1.0;
    if (tl.riverEdges.some(Boolean)) s += 1.2;
    if (tl.resourceId) s += 1.0;
  }
  return s;
}
