import { describe, expect, it } from 'vitest';
import { dispatch, generateGame } from '@/engine';
import { getAttentionItems } from '@/ui/attention';

/**
 * Attention selectors (docs/UI_REWORK.md P1.1): units needing orders, cities
 * with empty queues, and missing research — all read-only over GameState.
 */

const OPTIONS = {
  seed: 424242,
  preset: 'pangaea' as const,
  sizeId: 'duel',
  humanCivId: 'rome',
  aiCivIds: ['egypt'],
  difficulty: 1,
};

function humanIdOf(state: ReturnType<typeof generateGame>): number {
  return state.players.find((p) => p.isHuman)!.id;
}

describe('getAttentionItems', () => {
  it('flags fresh units and missing research at boot, no cities yet', () => {
    const state = generateGame(OPTIONS);
    const items = getAttentionItems(state);
    const units = items.filter((i) => i.kind === 'unit');
    expect(units.length).toBeGreaterThan(0);
    expect(items.filter((i) => i.kind === 'city')).toEqual([]);
    expect(items.filter((i) => i.kind === 'research')).toHaveLength(1);
  });

  it('a founded city with an empty queue needs production', () => {
    const state = generateGame(OPTIONS);
    const humanId = humanIdOf(state);
    const settler = Object.values(state.units).find(
      (u) => u.ownerId === humanId && u.typeId === 'settler',
    )!;
    dispatch(state, { type: 'foundCity', unitId: settler.id });
    const items = getAttentionItems(state);
    expect(items.filter((i) => i.kind === 'city')).toHaveLength(1);
  });

  it('setting production and research clears those items', () => {
    const state = generateGame(OPTIONS);
    const humanId = humanIdOf(state);
    const settler = Object.values(state.units).find(
      (u) => u.ownerId === humanId && u.typeId === 'settler',
    )!;
    dispatch(state, { type: 'foundCity', unitId: settler.id });
    const city = Object.values(state.cities).find((c) => c.ownerId === humanId)!;
    dispatch(state, {
      type: 'setProduction',
      cityId: city.id,
      item: { kind: 'unit', id: 'warrior' },
    });
    dispatch(state, { type: 'setResearch', techId: 'pottery' });
    const items = getAttentionItems(state);
    expect(items.filter((i) => i.kind === 'city')).toEqual([]);
    expect(items.filter((i) => i.kind === 'research')).toEqual([]);
  });

  it('fortified and sleeping units need no orders', () => {
    const state = generateGame(OPTIONS);
    const humanId = humanIdOf(state);
    const before = getAttentionItems(state).filter((i) => i.kind === 'unit').length;
    expect(before).toBeGreaterThan(0);
    for (const u of Object.values(state.units).filter((u) => u.ownerId === humanId)) {
      dispatch(state, { type: 'fortify', unitId: u.id });
    }
    expect(getAttentionItems(state).filter((i) => i.kind === 'unit')).toEqual([]);
  });

  it('returns nothing once the game is over', () => {
    const state = generateGame(OPTIONS);
    state.winner = { playerId: 0, victory: 'score' };
    expect(getAttentionItems(state)).toEqual([]);
  });
});
