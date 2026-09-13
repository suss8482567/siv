import { describe, expect, it } from 'vitest';
import { dispatch, generateGame } from '@/engine';

/**
 * P3.1 repeat production + P3.2 research queue. Both are absent-when-default
 * (devIncome precedent), so untouched flows keep byte-identical serialization.
 */

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
  return { state, humanId, city };
}

function runTurns(state: ReturnType<typeof generateGame>, n: number): void {
  for (let i = 0; i < n; i++) dispatch(state, { type: 'endTurn' });
}

function completionsFor(state: ReturnType<typeof generateGame>, cityId: number, n: number): number {
  let done = 0;
  for (let i = 0; i < n; i++) {
    const { events } = dispatch(state, { type: 'endTurn' });
    done += events.filter((e) => e.kind === 'productionComplete' && e.cityId === cityId).length;
  }
  return done;
}

describe('repeat production (P3.1)', () => {
  it('re-queues a finished unit while repeat is set', () => {
    const { state, city } = bootWithCity();
    dispatch(state, { type: 'setProduction', cityId: city.id, item: { kind: 'unit', id: 'warrior' } });
    dispatch(state, { type: 'setProductionRepeat', cityId: city.id, repeat: true });
    // A warrior (40 hammers) finishes at least once and the same item re-queues.
    // (Unit headcounts fluctuate — barbarians raid — so count completions.)
    expect(completionsFor(state, city.id, 40)).toBeGreaterThan(0);
    expect(city.productionQueue).toEqual([{ kind: 'unit', id: 'warrior' }]);
    expect(city.productionRepeat).toBe(true);
  });

  it('clearing repeat finishes once and drops the flag', () => {
    const { state, city } = bootWithCity();
    dispatch(state, { type: 'setProduction', cityId: city.id, item: { kind: 'unit', id: 'warrior' } });
    dispatch(state, { type: 'setProductionRepeat', cityId: city.id, repeat: true });
    dispatch(state, { type: 'setProductionRepeat', cityId: city.id, repeat: false });
    expect('productionRepeat' in city).toBe(false);
    runTurns(state, 30);
    expect(city.productionQueue).toEqual([]);
  });

  it('buildings are one-shot: completion clears a stale repeat flag', () => {
    const { state, city } = bootWithCity();
    dispatch(state, { type: 'setProduction', cityId: city.id, item: { kind: 'building', id: 'monument' } });
    dispatch(state, { type: 'setProductionRepeat', cityId: city.id, repeat: true });
    dispatch(state, { type: 'devFinishProduction', cityId: city.id });
    expect(city.buildings).toContain('monument');
    expect(city.productionQueue).toEqual([]);
    expect('productionRepeat' in city).toBe(false);
  });
});

describe('research queue (P3.2)', () => {
  it('completion advances into the queued tech', () => {
    const { state, humanId } = bootWithCity();
    dispatch(state, { type: 'setResearch', techId: 'pottery' });
    dispatch(state, { type: 'queueResearch', techId: 'writing' });
    const me = state.players[humanId];
    expect(me.researchQueue).toEqual(['writing']);
    runTurns(state, 120);
    expect(me.researchedTechIds).toContain('pottery');
    expect(me.researchedTechIds).toContain('writing');
    expect(me.researchQueue).toBeUndefined();
  });

  it('queueing into an idle lab starts it immediately; dequeue cleans up', () => {
    const { state, humanId } = bootWithCity();
    const me = state.players[humanId];
    dispatch(state, { type: 'queueResearch', techId: 'pottery' });
    expect(me.researchingTechId).toBe('pottery');
    expect(me.researchQueue).toBeUndefined();
    dispatch(state, { type: 'queueResearch', techId: 'mining' });
    dispatch(state, { type: 'queueResearch', techId: 'mining' }); // dup ignored
    expect(me.researchQueue).toEqual(['mining']);
    dispatch(state, { type: 'dequeueResearch', techId: 'mining' });
    expect(me.researchQueue).toBeUndefined();
  });

  it('known and active techs never queue', () => {
    const { state, humanId } = bootWithCity();
    const me = state.players[humanId];
    dispatch(state, { type: 'queueResearch', techId: 'agriculture' }); // known from boot
    expect(me.researchQueue).toBeUndefined();
    dispatch(state, { type: 'setResearch', techId: 'pottery' });
    dispatch(state, { type: 'queueResearch', techId: 'pottery' }); // active
    expect(me.researchQueue).toBeUndefined();
  });
});

describe('hash cleanliness', () => {
  it('untouched flows serialize without the new fields', () => {
    const state = generateGame(OPTIONS);
    runTurns(state, 5);
    const json = JSON.stringify(state);
    expect(json).not.toContain('productionRepeat');
    expect(json).not.toContain('researchQueue');
  });
});
