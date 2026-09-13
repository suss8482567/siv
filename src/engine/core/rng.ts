/**
 * Deterministic PRNG (mulberry32) with a serializable u32 state.
 * This is the ONLY randomness source permitted inside src/engine.
 */
import type { GameState } from './types';

/**
 * One draw from the game-state's serializable rng stream, as a fraction
 * in [0,1). Combat rolls and barbarian/AI decisions share this stream so
 * replays stay deterministic.
 */
export function nextRngFraction(state: GameState): number {
  state.rngState = (Math.imul(state.rngState ^ (state.rngState >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
  return (state.rngState % 10000) / 10000;
}

export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }

  get state(): number {
    return this.s;
  }

  set state(v: number) {
    this.s = v >>> 0;
  }

  nextU32(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Uniform float in [0, 1). */
  float(): number {
    return this.nextU32() / 4294967296;
  }

  uniform(min: number, max: number): number {
    return min + (max - min) * this.float();
  }

  /** Integer in [min, max], inclusive on both ends. */
  int(min: number, max: number): number {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.float() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.float() * arr.length)];
  }

  shuffled<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.float() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }
}
