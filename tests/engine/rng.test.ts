import { describe, expect, it } from 'vitest';
import { Rng } from '@/engine';

describe('Rng determinism', () => {
  it('produces identical sequences from the same seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 100 }, () => a.nextU32());
    const seqB = Array.from({ length: 100 }, () => b.nextU32());
    expect(seqA).toEqual(seqB);
  });

  it('diverges on different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.nextU32()).not.toBe(b.nextU32());
  });

  it('state checkpoint round-trips', () => {
    const a = new Rng(7);
    a.nextU32();
    a.nextU32();
    const saved = a.state;
    const expected = [a.nextU32(), a.nextU32(), a.nextU32()];
    a.state = saved;
    expect([a.nextU32(), a.nextU32(), a.nextU32()]).toEqual(expected);
  });

  it('int() stays within inclusive bounds', () => {
    const rng = new Rng(99);
    for (let i = 0; i < 500; i++) {
      const v = rng.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it('shuffled() preserves elements', () => {
    const rng = new Rng(5);
    const out = rng.shuffled([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
