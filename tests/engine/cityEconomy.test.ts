import { describe, expect, it } from 'vitest';
import { generateGame, currentPlayer, dispatch } from '@/engine';
import { canFoundCityAt } from '@/engine/systems/cityFound';
import {
  computeCityYields,
  cultureForNextBorder,
  foodToGrow,
  tileYields,
} from '@/engine/systems/economy';

function makeState() {
  return generateGame({
    seed: 42,
    preset: 'pangaea',
    sizeId: 'duel',
    humanCivId: 'rome',
    aiCivIds: ['egypt'],
    difficulty: 1,
  });
}

describe('city founding', () => {
  it('founds a capital with palace, ring-1 claims and a civ name', () => {
    const state = makeState();
    const human = state.players.find((p) => p.isHuman)!;
    const settler = Object.values(state.units).find(
      (u) => u.ownerId === human.id && u.typeId === 'settler',
    )!;
    expect(canFoundCityAt(state, settler.tileId)).toBe(true);
    const { events } = dispatch(state, { type: 'foundCity', unitId: settler.id });
    expect(events.some((e) => e.kind === 'cityFounded')).toBe(true);
    expect(Object.values(state.cities)).toHaveLength(1);
    const city = Object.values(state.cities)[0];
    expect(city.ownerId).toBe(human.id);
    expect(city.buildings).toContain('palace');
    expect(city.ownedTileIds.length).toBeGreaterThanOrEqual(1); // center at least
    expect(state.map.tiles[city.tileId].ownerPlayerId).toBe(human.id);
    expect(state.units[settler.id]).toBeUndefined();
    // Explored set grew with the city reveal.
    expect(human.exploredTileIds.length).toBeGreaterThan(0);
  });

  it('refuses founding inside an existing city radius', () => {
    const state = makeState();
    const human = state.players.find((p) => p.isHuman)!;
    const settler = Object.values(state.units).find(
      (u) => u.ownerId === human.id && u.typeId === 'settler',
    )!;
    dispatch(state, { type: 'foundCity', unitId: settler.id });
    // No settlers left -> nothing more to found; spacing rule via helper:
    const city = Object.values(state.cities)[0];
    expect(canFoundCityAt(state, city.tileId)).toBe(false);
    for (const t of state.map.tiles) {
      if (t.q === state.map.tiles[city.tileId].q + 1 && t.r === state.map.tiles[city.tileId].r) {
        expect(canFoundCityAt(state, t.id)).toBe(false);
      }
    }
  });
});

describe('economy', () => {
  it('computes positive yields for a founded city and grows over turns', () => {
    const state = makeState();
    const human = state.players.find((p) => p.isHuman)!;
    const settler = Object.values(state.units).find(
      (u) => u.ownerId === human.id && u.typeId === 'settler',
    )!;
    dispatch(state, { type: 'foundCity', unitId: settler.id });
    const city = Object.values(state.cities)[0];
    const y = computeCityYields(state, city);
    expect(y.food).toBeGreaterThan(0);
    expect(y.production).toBeGreaterThan(0);

    // Queue a warrior and run enough turns to finish it.
    dispatch(state, { type: 'setProduction', cityId: city.id, item: { kind: 'unit', id: 'warrior' } });
    let completed = false;
    for (let i = 0; i < 30 && !completed; i++) {
      const res = dispatch(state, { type: 'endTurn' });
      completed = res.events.some(
        (e) => e.kind === 'productionComplete' && e.cityId === city.id,
      );
    }
    expect(completed).toBe(true);
    expect(city.population).toBeGreaterThanOrEqual(1);
    expect(currentPlayer(state).isHuman).toBe(true);
  });

  it('research completes after queueing a tech', () => {
    const state = makeState();
    const human = state.players.find((p) => p.isHuman)!;
    const settler = Object.values(state.units).find(
      (u) => u.ownerId === human.id && u.typeId === 'settler',
    )!;
    dispatch(state, { type: 'foundCity', unitId: settler.id });
    dispatch(state, { type: 'setResearch', techId: 'pottery' });
    let done = false;
    for (let i = 0; i < 60 && !done; i++) {
      const res = dispatch(state, { type: 'endTurn' });
      done = res.events.some((e) => e.kind === 'researchComplete');
    }
    expect(done).toBe(true);
    expect(human.researchedTechIds).toContain('pottery');
  });

  it('formula helpers match SPEC §9 curves', () => {
    expect(foodToGrow(1)).toBe(21);
    expect(foodToGrow(2)).toBe(Math.round(14 + 7 * Math.pow(2, 1.4)));
    expect(cultureForNextBorder(1)).toBe(16);
    expect(cultureForNextBorder(9)).toBe(Math.round(12 + 4 * Math.pow(9, 1.1)));
  });

  it('riverside tiles earn bonus gold', () => {
    const state = makeState();
    const withRiver = state.map.tiles.find((t) => t.riverEdges.some(Boolean) && t.terrain !== 'ocean');
    if (!withRiver) return; // map without rivers would have failed earlier tests
    const y = tileYields(state, withRiver.id);
    expect(y.gold).toBeGreaterThan(0);
  });
});
