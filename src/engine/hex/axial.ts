/**
 * Hex grid math: pointy-top hexes, axial (q, r) coordinates internally,
 * odd-r offset rows for map-array storage. Pure functions only.
 */

export interface Axial {
  q: number;
  r: number;
}

/** Edge i of a tile faces neighbor direction i. */
export const HEX_DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function axialKey(q: number, r: number): string {
  return `${q},${r}`;
}

/** Map tiles are stored row-major in odd-r offset space. */
export function offsetToAxial(col: number, row: number): Axial {
  const q = col - ((row - (row & 1)) >> 1);
  return { q, r: row };
}

export function axialToOffset(q: number, r: number): { col: number; row: number } {
  const col = q + ((r - (r & 1)) >> 1);
  return { col, row: r };
}

/** Pixel position of a hex center (pointy-top), size s = center-to-corner. */
export function tileToPixel(q: number, r: number, s: number): { x: number; y: number } {
  return {
    x: s * Math.sqrt(3) * (q + r / 2),
    y: s * 1.5 * r,
  };
}

/** Nearest tile for a pixel position (inverse of tileToPixel via cube rounding). */
export function pixelToTile(x: number, y: number, s: number): Axial {
  const qf = (Math.sqrt(3) / 3) * (x / s) - (1 / 3) * (y / s);
  const rf = ((2 / 3) * y) / s;
  return cubeRound(qf, rf);
}

function cubeRound(qf: number, rf: number): Axial {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

export function hexDistance(aq: number, ar: number, bq: number, br: number): number {
  const dq = aq - bq;
  const dr = ar - br;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function neighborsOf(q: number, r: number): Axial[] {
  return HEX_DIRECTIONS.map((d) => ({ q: q + d.q, r: r + d.r }));
}

/** All tiles within `radius` of center, including the center itself. */
export function tilesInRange(q: number, r: number, radius: number): Axial[] {
  const out: Axial[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const lo = Math.max(-radius, -dq - radius);
    const hi = Math.min(radius, -dq + radius);
    for (let dr = lo; dr <= hi; dr++) {
      out.push({ q: q + dq, r: r + dr });
    }
  }
  return out;
}

/** Index of an axial coordinate within an odd-r offset map; -1 when out of bounds. */
export function tileIndex(q: number, r: number, width: number, heightRows: number): number {
  const { col, row } = axialToOffset(q, r);
  if (col < 0 || col >= width || row < 0 || row >= heightRows) return -1;
  return row * width + col;
}
