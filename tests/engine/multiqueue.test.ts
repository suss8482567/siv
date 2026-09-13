import { describe, expect, it } from 'vitest';
import { dispatch, generateGame } from '@/engine';

/** P3.5 multi-queue production: append, remove, reorder around a single head. */

const OPTIONS = {
  seed: 424242,
  preset: 'pangaea' as const,
  sizeId: 'duel',
  humanCivId: 'rome',
  aiCivIds: ['egypt'],
  difficulty: 1,
};

function bootWithCity() {
  const state = generateGame(OPTIONS);
  const humanId = state.players.find((p) => p.isHuman)!.id;
  const settler = Object.values(state.units).find(
    (u) => u.ownerId === humanId && u.typeId === 'settler',
  )!;
  dispatch(state, { type: 'foundCity', unitId: settler.id });
  const city = Object.values(state.cities).find((c) => c.ownerId === humanId)!;
  return { state, city };
}

const WARRIOR = { kind: 'unit', id: 'warrior' } as const;
const SCOUT = { kind: 'unit', id: 'scout' } as const;

describe('production queue (P3.5)', () => {
  it('appends to a cap of 5 and ignores the 6th', () => {
    const { state, city } = bootWithCity();
    dispatch(state, { type: 'setProduction', cityId: city.id, item: { ...WARRIOR } });
    for (let i = 0; i < 4; i++) {
      dispatch(state, { type: 'queueProduction', cityId: city.id, item: { ...SCOUT } });
    }
    expect(city.productionQueue).toHaveLength(5);
    dispatch(state, { type: 'queueProduction', cityId: city.id, item: { ...SCOUT } });
    expect(city.productionQueue).toHaveLength(5);
  });

  it('rejects locked items and foreign cities', () => {
    const { state, city } = bootWithCity();
    dispatch(state, { type: 'queueProduction', cityId: city.id, item: { kind: 'unit', id: 'knight' } });
    expect(city.productionQueue).toEqual([]);
    dispatch(state, { type: 'queueProduction', cityId: 9999, item: { ...WARRIOR } });
    expect(city.productionQueue).toEqual([]);
  });

  it('completion consumes the head and the next item starts', () => {
    const { state, city } = bootWithCity();
    dispatch(state, { type: 'setProduction', cityId: city.id, item: { ...WARRIOR } });
    dispatch(state, { type: 'queueProduction', cityId: city.id, item: { ...SCOUT } });
    let done = 0;
    for (let i = 0; i < 60 && done === 0; i++) {
      const { events } = dispatch(state, { type: 'endTurn' });
      done = events.filter((e) => e.kind === 'productionComplete' && e.cityId === city.id).length;
    }
    expect(done).toBe(1);
    expect(city.productionQueue).toEqual([{ ...SCOUT }]);
  });

  it('dequeue and reorder edit the waiting line only', () => {
    const { state, city } = bootWithCity();
    dispatch(state, { type: 'setProduction', cityId: city.id, item: { ...WARRIOR } });
    dispatch(state, { type: 'queueProduction', cityId: city.id, item: { ...SCOUT } });
    dispatch(state, { type: 'queueProduction', cityId: city.id, item: { kind: 'building', id: 'monument' } });
    dispatch(state, { type: 'reorderProduction', cityId: city.id, fromIndex: 2, toIndex: 1 });
    expect(city.productionQueue.map((q) => q.id)).toEqual(['warrior', 'monument', 'scout']);
    dispatch(state, { type: 'dequeueProduction', cityId: city.id, index: 1 });
    expect(city.productionQueue.map((q) => q.id)).toEqual(['warrior', 'scout']);
    // Invalid indices and no-ops are ignored.
    dispatch(state, { type: 'dequeueProduction', cityId: city.id, index: 9 });
    dispatch(state, { type: 'reorderProduction', cityId: city.id, fromIndex: 0, toIndex: 0 });
    dispatch(state, { type: 'reorderProduction', cityId: city.id, fromIndex: -1, toIndex: 5 });
    expect(city.productionQueue.map((q) => q.id)).toEqual(['warrior', 'scout']);
  });

  it('setProduction still replaces the whole line', () => {
    const { state, city } = bootWithCity();
    dispatch(state, { type: 'setProduction', cityId: city.id, item: { ...WARRIOR } });
    dispatch(state, { type: 'queueProduction', cityId: city.id, item: { ...SCOUT } });
    dispatch(state, { type: 'setProduction', cityId: city.id, item: { kind: 'building', id: 'monument' } });
    expect(city.productionQueue).toEqual([{ kind: 'building', id: 'monument' }]);
  });

  it('repeat waits for the queue to drain, then rebuilds', () => {
    const { state, city } = bootWithCity();
    dispatch(state, { type: 'setProduction', cityId: city.id, item: { ...WARRIOR } });
    dispatch(state, { type: 'queueProduction', cityId: city.id, item: { ...SCOUT } });
    dispatch(state, { type: 'setProductionRepeat', cityId: city.id, repeat: true });
    let done = 0;
    for (let i = 0; i < 60 && done === 0; i++) {
      const { events } = dispatch(state, { type: 'endTurn' });
      done = events.filter((e) => e.kind === 'productionComplete' && e.cityId === city.id).length;
    }
    expect(done).toBe(1);
    // Head finished into a non-empty queue: no repeat re-queue yet.
    expect(city.productionQueue).toEqual([{ ...SCOUT }]);
    expect(city.productionRepeat).toBe(true);
  });
});
