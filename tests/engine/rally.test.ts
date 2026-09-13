import { describe, expect, it } from 'vitest';
import { dispatch, generateGame } from '@/engine';
import { neighborsOf, tileIndex } from '@/engine/hex/axial';
import { enterCostFor, unitAt } from '@/engine/systems/movement';

/** P3.4 rally points: muster newly built units, march at turn start. */

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

function isLand(state: ReturnType<typeof generateGame>, tid: number): boolean {
  const t = state.map.tiles[tid];
  return !!t && t.terrain !== 'ocean' && t.terrain !== 'coast' && t.elevation !== 'mountain';
}

/** First free land neighbor of a tile (neighborsOf is absolute axial). */
function freeLandNeighbor(state: ReturnType<typeof generateGame>, fromTile: number): number {
  const t = state.map.tiles[fromTile];
  for (const ax of neighborsOf(t.q, t.r)) {
    const nb = tileIndex(ax.q, ax.r, state.map.width, state.map.height);
    if (nb >= 0 && isLand(state, nb) && !unitAt(state, nb)) return nb;
  }
  throw new Error('no free land neighbor (test map assumption)');
}

type TestState = ReturnType<typeof generateGame>;

/** Produce a warrior with an active rally; returns the flagged fresh unit. */
function produceFlagged(state: TestState, humanId: number, cityId: number) {
  const city = state.cities[cityId];
  dispatch(state, { type: 'setProduction', cityId, item: { kind: 'unit', id: 'warrior' } });
  const before = new Set(Object.keys(state.units).map(Number));
  dispatch(state, { type: 'devFinishProduction', cityId });
  const fresh = Object.values(state.units).find((u) => !before.has(u.id))!;
  expect(fresh.gotoRally).toBe(true);
  void humanId;
  void city;
  return fresh;
}

describe('rally points (P3.4)', () => {
  it('produced units flag and march to an adjacent rally in one turn', () => {
    const { state, humanId, city } = bootWithCity();
    // Rally must exist before production for the auto-flag.
    dispatch(state, { type: 'setRally', tileId: freeLandNeighbor(state, city.tileId) });
    const fresh = produceFlagged(state, humanId, city.id);
    // Re-aim at a cheap adjacent tile so one turn always suffices.
    const t = state.map.tiles[fresh.tileId];
    let goal = -1;
    for (const ax of neighborsOf(t.q, t.r)) {
      const nb = tileIndex(ax.q, ax.r, state.map.width, state.map.height);
      if (nb >= 0 && isLand(state, nb) && !unitAt(state, nb) && enterCostFor(state, fresh, nb) <= 2) {
        goal = nb;
        break;
      }
    }
    expect(goal).toBeGreaterThanOrEqual(0);
    dispatch(state, { type: 'setRally', tileId: goal });
    dispatch(state, { type: 'endTurn' });
    expect(fresh.tileId).toBe(goal);
    expect(fresh.gotoRally).toBeUndefined();
  });

  it('manual orders take a unit off rally duty', () => {
    const { state, humanId, city } = bootWithCity();
    dispatch(state, { type: 'setRally', tileId: freeLandNeighbor(state, city.tileId) });
    const fresh = produceFlagged(state, humanId, city.id);
    dispatch(state, { type: 'fortify', unitId: fresh.id });
    expect(fresh.gotoRally).toBeUndefined();
  });

  it('unreachable rally self-heals instead of stalling', () => {
    const { state, humanId, city } = bootWithCity();
    const ocean = state.map.tiles.findIndex((t) => t.terrain === 'ocean');
    expect(ocean).toBeGreaterThanOrEqual(0);
    dispatch(state, { type: 'setRally', tileId: ocean });
    const fresh = produceFlagged(state, humanId, city.id);
    const parked = fresh.tileId;
    dispatch(state, { type: 'endTurn' });
    expect(fresh.gotoRally).toBeUndefined();
    expect(fresh.tileId).toBe(parked);
  });

  it('clearing and invalid rallies behave', () => {
    const { state, humanId, city } = bootWithCity();
    dispatch(state, { type: 'setRally', tileId: freeLandNeighbor(state, city.tileId) });
    dispatch(state, { type: 'setRally', tileId: null });
    expect(state.players[humanId].rallyTileId).toBeUndefined();
    dispatch(state, { type: 'setRally', tileId: 999999 });
    expect(state.players[humanId].rallyTileId).toBeUndefined();
  });
});
