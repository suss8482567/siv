import { describe, expect, it } from 'vitest';
import { dispatch, generateGame } from '@/engine';
import { assignWorkedTiles, focusYieldScore } from '@/engine/systems/economy';

/** P3.3 city focus: doubled-weight steering of worked-tile assignment. */

describe('focusYieldScore', () => {
  const y = { food: 2, production: 2, gold: 2, science: 0, culture: 0 };
  it('balanced keeps stock weights', () => {
    expect(focusYieldScore(y, undefined)).toBe(2 * 1.2 + 2 * 1.1 + 2 * 0.7);
  });
  it('each focus doubles exactly its yield', () => {
    expect(focusYieldScore(y, 'growth')).toBe(2 * 2.4 + 2 * 1.1 + 2 * 0.7);
    expect(focusYieldScore(y, 'production')).toBe(2 * 1.2 + 2 * 2.2 + 2 * 0.7);
    expect(focusYieldScore(y, 'gold')).toBe(2 * 1.2 + 2 * 1.1 + 2 * 1.4);
    expect(focusYieldScore(y, 'science')).toBe(2 * 1.2 + 2 * 1.1 + 2 * 0.7 + 0 * 2.6);
    expect(focusYieldScore(y, 'culture')).toBe(2 * 1.2 + 2 * 1.1 + 2 * 0.7 + 0 * 2);
  });
  it('reorders competing tiles by focus', () => {
    const farm = { food: 3, production: 0, gold: 0, science: 0, culture: 0 };
    const mine = { food: 0, production: 3, gold: 0, science: 0, culture: 0 };
    expect(focusYieldScore(farm, 'growth')).toBeGreaterThan(focusYieldScore(mine, 'growth'));
    expect(focusYieldScore(mine, 'production')).toBeGreaterThan(focusYieldScore(farm, 'production'));
  });
});

describe('setCityFocus', () => {
  function bootWithCity(seed: number) {
    const state = generateGame({
      seed, preset: 'pangaea' as const, sizeId: 'duel',
      humanCivId: 'rome', aiCivIds: ['egypt'], difficulty: 1,
    });
    const humanId = state.players.find((p) => p.isHuman)!.id;
    const settler = Object.values(state.units).find(
      (u) => u.ownerId === humanId && u.typeId === 'settler',
    )!;
    dispatch(state, { type: 'foundCity', unitId: settler.id });
    const city = Object.values(state.cities).find((c) => c.ownerId === humanId)!;
    return { state, city };
  }

  it('sets, rebalances to absent, and rejects garbage', () => {
    const { state, city } = bootWithCity(424242);
    dispatch(state, { type: 'setCityFocus', cityId: city.id, focus: 'growth' });
    expect(city.focus).toBe('growth');
    dispatch(state, { type: 'setCityFocus', cityId: city.id, focus: 'balanced' });
    expect('focus' in city).toBe(false);
    dispatch(state, { type: 'setCityFocus', cityId: city.id, focus: 'spice' as never });
    expect('focus' in city).toBe(false);
  });

  it('growth focus steers worked tiles on real maps', () => {
    // Search fixed seeds for a city where focus changes the assignment —
    // deterministic (same code + seeds ⇒ same maps), never flaky.
    let differed = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const { state, city } = bootWithCity(seed);
      if (city.population < 1 || city.ownedTileIds.length < 3) continue;
      const plain = assignWorkedTiles(state, { ...city, focus: undefined });
      const focused = assignWorkedTiles(state, { ...city, focus: 'growth' });
      if (JSON.stringify(plain) !== JSON.stringify(focused)) differed++;
    }
    expect(differed).toBeGreaterThan(0);
  });

  it('assignment is deterministic under focus', () => {
    const a = bootWithCity(777);
    const b = bootWithCity(777);
    dispatch(a.state, { type: 'setCityFocus', cityId: a.city.id, focus: 'science' });
    dispatch(b.state, { type: 'setCityFocus', cityId: b.city.id, focus: 'science' });
    expect(assignWorkedTiles(a.state, a.city)).toEqual(assignWorkedTiles(b.state, b.city));
  });
});
