/**
 * Save file plumbing (SPEC §15) — pure-function coverage only. The IndexedDB
 * paths need a browser; they're exercised through Playwright instead.
 */
import { describe, expect, it } from 'vitest';
import { generateGame } from '@/engine';
import { makeSaveFile, validateSaveFile } from '@/save/persistence';

function sampleState() {
  return generateGame({
    seed: 42,
    preset: 'pangaea',
    sizeId: 'duel',
    humanCivId: 'rome',
    aiCivIds: ['egypt'],
    difficulty: 1,
  });
}

describe('save files', () => {
  it('round-trips makeSaveFile → JSON → validateSaveFile losslessly', () => {
    const state = sampleState();
    const file = makeSaveFile(state, 'Rome');
    expect(file.magic).toBe('SIV');
    expect(file.version).toBe(1);
    expect(file.meta).toEqual({ turn: state.turn, civName: 'Rome' });
    const restored = validateSaveFile(JSON.parse(JSON.stringify(file)));
    expect(restored.state).toEqual(state); // GameState must stay POJO-pure
  });

  it('rejects non-SIV payloads, bad versions and corrupt state', () => {
    expect(() => validateSaveFile(null)).toThrow(/Not a save/);
    expect(() => validateSaveFile('save.json')).toThrow(/Not a save/);
    expect(() => validateSaveFile({ magic: 'NOPE', version: 1, state: sampleState() })).toThrow(/Not a SIV/);
    expect(() => validateSaveFile({ magic: 'SIV', version: 99, state: sampleState() })).toThrow(
      /Unsupported save version/,
    );
    expect(() =>
      validateSaveFile({ magic: 'SIV', version: 1, meta: { turn: 1, civName: 'x' }, savedAtIso: '', state: {} }),
    ).toThrow(/Corrupt/);
  });

  it('keeps the determinism inputs intact across a round-trip', () => {
    const state = sampleState();
    const restored = validateSaveFile(makeSaveFile(state, 'Rome')).state;
    // Same seed + rng stream ⇒ a loaded game replays identically from here.
    expect(restored.seed).toBe(state.seed);
    expect(restored.rngState).toBe(state.rngState);
    expect(restored.turn).toBe(state.turn);
    expect(restored.players.map((p) => p.researchedTechIds.slice().sort())).toEqual(
      state.players.map((p) => p.researchedTechIds.slice().sort()),
    );
  });
});
