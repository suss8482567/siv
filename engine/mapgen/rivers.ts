/**
 * River generation (M1): spring sources on high ground traced downhill,
 * marking riverEdges[d] on both tiles of each crossed edge. Deterministic.
 */
import { Rng } from '../core/rng';
import type { Tile } from '../core/types';
import { HEX_DIRECTIONS, axialToOffset } from '../hex/axial';

export function traceRivers(
  tiles: Tile[],
  heights: Float32Array,
  width: number,
  heightRows: number,
  rng: Rng,
  targetCount: number,
): void {
  const sources: number[] = [];
  for (const t of tiles) {
    if (t.terrain === 'ocean' || t.terrain === 'coast') continue;
    if (t.elevation !== 'hills' && t.elevation !== 'mountain') continue;
    sources.push(t.id);
  }
  const order = rng.shuffled(sources);
  let made = 0;
  for (const src of order) {
    if (made >= targetCount) break;
    if (tiles[src].riverEdges.some(Boolean)) continue; // already a confluence
    if (traceOne(tiles, heights, width, heightRows, src)) made += 1;
  }
}

/** Trace one river downhill from `src`. Returns true if at least one edge was marked. */
function traceOne(
  tiles: Tile[],
  heights: Float32Array,
  width: number,
  heightRows: number,
  src: number,
): boolean {
  let cur = src;
  let cameFrom = -1;
  let marked = 0;
  for (let step = 0; step < 64; step++) {
    const curTile = tiles[cur];
    let bestDir = -1;
    let bestIdx = -1;
    let bestH = Infinity;
    for (let d = 0; d < 6; d++) {
      if (curTile.riverEdges[d]) continue; // confluence with an existing flow: stop here
      const nIdx = neighborIndex(curTile.q, curTile.r, d, width, heightRows);
      if (nIdx < 0 || nIdx === cameFrom) continue;
      const nb = tiles[nIdx];
      if (nb.elevation === 'mountain') continue; // rivers never cross mountains
      if (heights[nIdx] < bestH) {
        bestH = heights[nIdx];
        bestDir = d;
        bestIdx = nIdx;
      }
    }
    if (bestDir < 0) break;
    // Uphill from a non-source tile means the basin is closed: stop before marking.
    if (step > 0 && bestH > heights[cur]) break;
    curTile.riverEdges[bestDir] = true;
    tiles[bestIdx].riverEdges[(bestDir + 3) % 6] = true;
    marked += 1;
    if (tiles[bestIdx].terrain === 'ocean' || tiles[bestIdx].terrain === 'coast') break;
    cameFrom = cur;
    cur = bestIdx;
  }
  return marked > 0;
}

export function neighborIndex(
  q: number,
  r: number,
  dir: number,
  width: number,
  heightRows: number,
): number {
  const d = HEX_DIRECTIONS[dir];
  const { col, row } = axialToOffset(q + d.q, r + d.r);
  if (col < 0 || col >= width || row < 0 || row >= heightRows) return -1;
  return row * width + col;
}
