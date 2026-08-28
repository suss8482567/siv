/**
 * Golden backstop (SPEC §16): a scripted 50-turn duel playthrough must be
 * bit-for-bit reproducible — run-to-run hash arrays match AND the final hash
 * matches the recorded constant. When an engine change intentionally alters
 * the simulation, update GOLDEN_FINAL_HASH deliberately and note it in
 * CONTINUE.md.
 */
import { describe, expect, it } from 'vitest';
import { dispatch, generateGame, hashState } from '@/engine';

const OPTIONS = {
  seed: 424242,
  preset: 'pangaea' as const,
  sizeId: 'duel',
  humanCivId: 'rome',
  aiCivIds: ['egypt'],
  difficulty: 1,
};

const TURNS = 50;
// Recorded from the deterministic playthrough below. Bump ONLY with intent
// (documented engine changes), never to silence a regression.
const GOLDEN_FINAL_HASH = 'eb4b2d49';

function playTurns(): string[] {
  const state = generateGame(OPTIONS);
  const hashes: string[] = [hashState(state)];
  for (let i = 0; i < TURNS; i++) {
    dispatch(state, { type: 'endTurn' });
    hashes.push(hashState(state));
  }
  return hashes;
}

describe('golden 50-turn playthrough', () => {
  it('is bit-for-bit reproducible across runs', () => {
    const a = playTurns();
    const b = playTurns();
    expect(b).toEqual(a);
    expect(a).toHaveLength(TURNS + 1);
  });

  it('matches the recorded golden hash', () => {
    const hashes = playTurns();
    expect(hashes[TURNS]).toBe(GOLDEN_FINAL_HASH);
  });
});
