import { Rng } from '../core/rng';

/**
 * Seeded value noise + fBm for map generation. Deterministic per seed.
 */
export class ValueNoise2D {
  private readonly perm: Uint8Array;

  constructor(rng: Rng) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng.float() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  private latticeValue(ix: number, iy: number): number {
    return this.perm[(this.perm[ix & 255] + iy) & 255] / 255;
  }

  /** Smooth value noise in [0, 1]. */
  sample(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const tx = x - ix;
    const ty = y - iy;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const v00 = this.latticeValue(ix, iy);
    const v10 = this.latticeValue(ix + 1, iy);
    const v01 = this.latticeValue(ix, iy + 1);
    const v11 = this.latticeValue(ix + 1, iy + 1);
    const a = v00 + (v10 - v00) * sx;
    const b = v01 + (v11 - v01) * sx;
    return a + (b - a) * sy;
  }

  /** Fractal Brownian motion, normalized to [0, 1]. */
  fbm(x: number, y: number, octaves = 5, lacunarity = 2, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.sample(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Ridged variant (sharp crests) — used for archipelago island chains. */
  ridged(x: number, y: number, octaves = 4): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(2 * this.sample(x * freq, y * freq) - 1);
      sum += amp * n * n;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }
}
