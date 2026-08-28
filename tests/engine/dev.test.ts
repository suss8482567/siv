/**
 * Dev/cheat tools: every dev.* command must be human-only, deterministic
 * (no RNG consumption) and produce exactly the promised effect.
 */
import { describe, expect, it } from 'vitest';
import { currentPlayer, dispatch, generateGame, hashState } from '@/engine';
import type { GameOptions, GameState } from '@/engine';
import { buildContentDb } from '@/content';
import { canFoundCityAt } from '@/engine/systems/cityFound';
import { forceCompleteCurrentItem } from '@/engine/systems/economy';
import { spawnUnit } from '@/engine/systems/spawn';
import { computeVisibleTiles, fogStateFor } from '@/engine/systems/visibility';

const BASE = {
  seed: 424242,
  preset: 'pangaea' as const,
  sizeId: 'duel',
  humanCivId: 'rome',
  aiCivIds: ['egypt'],
  difficulty: 1,
};

function newGame(): GameState {
  return generateGame(BASE satisfies GameOptions);
}

function humanOf(state: GameState) {
  return state.players.find((p) => p.isHuman)!;
}

/** The human's starting settler (guaranteed by mapgen populate). */
function startSettler(state: GameState) {
  const human = humanOf(state);
  return Object.values(state.units).find((u) => u.ownerId === human.id && u.typeId === 'settler')!;
}

function firstFoundableTile(state: GameState): number {
  const t = state.map.tiles.find((tile) => canFoundCityAt(state, tile.id));
  expect(t).toBeDefined();
  return t!.id;
}

describe('dev map reveal', () => {
  it('reveals the whole map and re-fogs it', () => {
    const state = newGame();
    const human = humanOf(state);
    const total = state.map.tiles.length;
    expect(human.exploredTileIds.length).toBeLessThan(total);

    dispatch(state, { type: 'devRevealMap', revealed: true });
    expect(human.devRevealAll).toBe(true);
    expect(human.exploredTileIds.length).toBe(total);
    expect(computeVisibleTiles(state, human.id).size).toBe(total);
    // Even a far corner reads as visible while revealed.
    expect(fogStateFor(state, human.id, new Set(), total - 1)).toBe('visible');

    dispatch(state, { type: 'devRevealMap', revealed: false });
    expect(human.devRevealAll).toBeUndefined();
    expect(human.exploredTileIds.length).toBe(0);
    expect(fogStateFor(state, human.id, new Set(), total - 1)).toBe('hidden');
  });

  it('keeps fog semantics untouched when the flag is absent', () => {
    const a = newGame();
    const b = structuredClone(a);
    dispatch(b, { type: 'devAddGold', amount: 10 });
    const hA = humanOf(a);
    const visibleA = computeVisibleTiles(a, hA.id);
    const visibleB = computeVisibleTiles(b, hA.id);
    expect([...visibleB]).toEqual([...visibleA]);
  });
});

describe('dev spawning', () => {
  it('spawns any unit owned by the human and reveals its sight', () => {
    const state = newGame();
    const human = humanOf(state);
    const settler = startSettler(state);
    const rngBefore = state.rngState;

    dispatch(state, { type: 'devSpawnUnit', typeId: 'archer', tileId: settler.tileId });
    const spawned = Object.values(state.units).filter(
      (u) => u.ownerId === human.id && u.typeId === 'archer',
    );
    expect(spawned).toHaveLength(1);
    expect(spawned[0].movementLeft).toBeGreaterThan(0);
    expect(spawned[0].attacksLeft).toBe(1);
    // Cheats never consume the RNG stream.
    expect(state.rngState).toBe(rngBefore);
  });

  it('respects 1UPT: blocked spawns fall back to a free adjacent tile', () => {
    const state = newGame();
    const human = humanOf(state);
    const settler = startSettler(state);
    const before = Object.keys(state.units).length;
    dispatch(state, { type: 'devSpawnUnit', typeId: 'warrior', tileId: settler.tileId });
    dispatch(state, { type: 'devSpawnUnit', typeId: 'warrior', tileId: settler.tileId });
    // Highest ids = the two just created (records iterate in id order).
    const spawned = Object.values(state.units)
      .filter((u) => u.ownerId === human.id && u.typeId === 'warrior')
      .sort((x, y) => y.id - x.id)
      .slice(0, 2);
    expect(new Set(spawned.map((u) => u.tileId)).size).toBe(2);
    expect(Object.keys(state.units).length).toBe(before + 2);
  });

  it('founds a city via normal rules without leaving a settler behind', () => {
    const state = newGame();
    const human = humanOf(state);
    const tileId = firstFoundableTile(state);
    const settlersBefore = Object.values(state.units).filter((u) => u.typeId === 'settler').length;

    const { events } = dispatch(state, { type: 'devSpawnCity', tileId });
    const cities = Object.values(state.cities).filter((c) => c.ownerId === human.id);
    expect(cities).toHaveLength(1);
    expect(cities[0].ownedTileIds.length).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e.kind === 'cityFounded')).toBe(true);
    expect(Object.values(state.units).filter((u) => u.typeId === 'settler')).toHaveLength(
      settlersBefore,
    );
  });

  it('refuses devSpawnCity on invalid spots without side effects', () => {
    const state = newGame();
    // Found once, then try to found again on the same spot (violates spacing).
    const first = firstFoundableTile(state);
    dispatch(state, { type: 'devSpawnCity', tileId: first });
    const citiesBefore = Object.keys(state.cities).length;
    const unitsBefore = Object.keys(state.units).length;
    const occupiedTile = Object.values(state.cities)[0].tileId;
    dispatch(state, { type: 'devSpawnCity', tileId: occupiedTile });
    expect(Object.keys(state.cities).length).toBe(citiesBefore);
    expect(Object.keys(state.units).length).toBe(unitsBefore);
  });
});

describe('dev empire grants', () => {
  it('adds gold and science, clamped at zero', () => {
    const state = newGame();
    const human = humanOf(state);
    const gold = human.gold;
    dispatch(state, { type: 'devAddGold', amount: 1000 });
    expect(human.gold).toBe(gold + 1000);
    dispatch(state, { type: 'devAddScience', amount: 250 });
    expect(human.scienceStored).toBe(250);
    dispatch(state, { type: 'devAddScience', amount: -400 });
    expect(human.scienceStored).toBe(0);
  });

  it('grants single techs and all techs; clears finished research', () => {
    const state = newGame();
    const human = humanOf(state);
    dispatch(state, { type: 'setResearch', techId: 'writing' });
    dispatch(state, { type: 'devGrantTech', techId: 'pottery' });
    expect(human.researchedTechIds).toContain('pottery');
    expect(human.researchingTechId).toBe('writing');

    dispatch(state, { type: 'devGrantTech', techId: 'writing' });
    expect(human.researchingTechId).toBeUndefined();

    dispatch(state, { type: 'devGrantTech', techId: 'all' });
    expect(human.researchedTechIds.length).toBe(Object.keys(buildContentDb().techs).length);
  });

  it('grows cities, injects culture and emits events', () => {
    const state = newGame();
    dispatch(state, { type: 'devSpawnCity', tileId: firstFoundableTile(state) });
    const human = humanOf(state);
    const city = Object.values(state.cities).find((c) => c.ownerId === human.id)!;
    const pop = city.population;

    const grown = dispatch(state, { type: 'devGrowCity', cityId: city.id });
    expect(city.population).toBe(pop + 1);
    expect(grown.events.some((e) => e.kind === 'cityGrew')).toBe(true);

    const culture = city.cultureStored;
    dispatch(state, { type: 'devAddCulture', cityId: city.id, amount: 50 });
    expect(city.cultureStored).toBe(culture + 50);
  });

  it('finishes production instantly for units and buildings', () => {
    const state = newGame();
    dispatch(state, { type: 'devSpawnCity', tileId: firstFoundableTile(state) });
    const human = humanOf(state);
    const city = Object.values(state.cities).find((c) => c.ownerId === human.id)!;

    // Archers are tech-gated since M5 — grant Archery before queuing one.
    dispatch(state, { type: 'devGrantTech', techId: 'archery' });
    dispatch(state, { type: 'setProduction', cityId: city.id, item: { kind: 'unit', id: 'archer' } });
    const done = dispatch(state, { type: 'devFinishProduction', cityId: city.id });
    expect(city.productionQueue).toHaveLength(0);
    expect(done.events.some((e) => e.kind === 'productionComplete')).toBe(true);
    const archers = Object.values(state.units).filter(
      (u) => u.ownerId === human.id && u.typeId === 'archer',
    );
    expect(archers).toHaveLength(1);

    dispatch(state, { type: 'setProduction', cityId: city.id, item: { kind: 'building', id: 'monument' } });
    dispatch(state, { type: 'devFinishProduction', cityId: city.id });
    expect(city.buildings).toContain('monument');
  });

  it('adds any building directly, skipping duplicates', () => {
    const state = newGame();
    dispatch(state, { type: 'devSpawnCity', tileId: firstFoundableTile(state) });
    const human = humanOf(state);
    const city = Object.values(state.cities).find((c) => c.ownerId === human.id)!;
    dispatch(state, { type: 'devAddBuilding', cityId: city.id, buildingId: 'granary' });
    dispatch(state, { type: 'devAddBuilding', cityId: city.id, buildingId: 'granary' });
    expect(city.buildings.filter((b) => b === 'granary')).toHaveLength(1);
  });

  it('refreshes every human unit to full hp/moves/attacks', () => {
    const state = newGame();
    const human = humanOf(state);
    const settler = startSettler(state);
    const warrior = spawnUnit(state, human.id, 'warrior', settler.tileId);
    warrior.hp = 13;
    warrior.movementLeft = 0;
    warrior.attacksLeft = 0;

    dispatch(state, { type: 'devRefreshUnits' });
    expect(warrior.hp).toBe(100);
    expect(warrior.movementLeft).toBe(buildContentDb().units.warrior.moves);
    expect(warrior.attacksLeft).toBe(1);
  });
});

describe('dev income per turn', () => {
  it('applies the flat bonus exactly once per endTurn vs an identical twin', () => {
    const a = newGame();
    const b = newGame();
    // Both twins found their capital identically so there are cities to feed.
    for (const s of [a, b]) {
      dispatch(s, { type: 'foundCity', unitId: startSettler(s).id });
    }
    const bonus = { gold: 50, science: 40, food: 10, production: 30, culture: 20 };
    dispatch(b, { type: 'devSetIncome', income: bonus });

    const beforeA = snapshot(a);
    const beforeB = snapshot(b);
    dispatch(a, { type: 'endTurn' });
    dispatch(b, { type: 'endTurn' });
    const afterA = snapshot(a);
    const afterB = snapshot(b);

    expect(afterB.gold - beforeB.gold - (afterA.gold - beforeA.gold)).toBe(bonus.gold);
    expect(
      afterB.scienceStored - beforeB.scienceStored - (afterA.scienceStored - beforeA.scienceStored),
    ).toBe(bonus.science);
    for (const cityId of Object.keys(beforeB.city)) {
      expect(afterB.city[cityId].food - beforeB.city[cityId].food).toBe(bonus.food + (afterA.city[cityId].food - beforeA.city[cityId].food));
      expect(afterB.city[cityId].production - beforeB.city[cityId].production).toBe(
        bonus.production + (afterA.city[cityId].production - beforeA.city[cityId].production),
      );
      expect(afterB.city[cityId].culture - beforeB.city[cityId].culture).toBe(
        bonus.culture + (afterA.city[cityId].culture - beforeA.city[cityId].culture),
      );
    }
  });

  it('clearing the income removes the field instead of storing zeros', () => {
    const state = newGame();
    const human = humanOf(state);
    dispatch(state, { type: 'devSetIncome', income: { gold: 25 } });
    expect(human.devIncome).toEqual({ gold: 25 });
    dispatch(state, { type: 'devSetIncome', income: {} });
    expect(human.devIncome).toBeUndefined();
  });
});

function snapshot(state: GameState) {
  const human = humanOf(state);
  const city: Record<string, { food: number; production: number; culture: number }> = {};
  for (const c of Object.values(state.cities)) {
    if (c.ownerId !== human.id) continue;
    city[c.id] = { food: c.foodStored, production: c.productionStored, culture: c.cultureStored };
  }
  return { gold: human.gold, scienceStored: human.scienceStored, city };
}

describe('dev barbarians & permissions', () => {
  it('smites all barbarian units and camps but nothing else', () => {
    const state = newGame();
    const human = humanOf(state);
    const settler = startSettler(state);
    const friendly = spawnUnit(state, human.id, 'warrior', settler.tileId);
    const barb = state.players.find((p) => p.civId === 'barbarians');
    expect(barb).toBeDefined();
    const campTile = firstFoundableTile(state);
    const raider = spawnUnit(state, barb!.id, 'warrior', campTile);
    state.barbarianCamps.push({ tileId: campTile, unitIds: [raider.id] });

    dispatch(state, { type: 'devSmiteBarbarians' });
    expect(state.barbarianCamps).toHaveLength(0);
    expect(Object.values(state.units).some((u) => u.ownerId === barb!.id)).toBe(false);
    expect(state.units[friendly.id]).toBeDefined();
  });

  it('ignores dev commands issued while an AI is the current player', () => {
    const state = newGame();
    state.currentPlayerIndex = state.playerOrder.indexOf(
      state.playerOrder.find((id) => !state.players[id].isHuman)!,
    );
    expect(currentPlayer(state).isHuman).toBe(false);
    const ai = currentPlayer(state);
    const gold = ai.gold;
    dispatch(state, { type: 'devAddGold', amount: 9999 });
    dispatch(state, { type: 'devRevealMap', revealed: true });
    expect(ai.gold).toBe(gold);
    expect(ai.devRevealAll).toBeUndefined();
  });
});

describe('dev determinism', () => {
  it('identical cheat sequences produce identical hashes', () => {
    const play = (): string => {
      const s = newGame();
      const settler = startSettler(s);
      dispatch(s, { type: 'devRevealMap', revealed: true });
      dispatch(s, { type: 'devSpawnUnit', typeId: 'archer', tileId: settler.tileId });
      dispatch(s, { type: 'devAddGold', amount: 750 });
      dispatch(s, { type: 'devGrantTech', techId: 'all' });
      dispatch(s, { type: 'devSpawnCity', tileId: firstFoundableTile(s) });
      return hashState(s);
    };
    expect(play()).toBe(play());
  });

  it('forceCompleteCurrentItem is a no-op on an empty queue', () => {
    const state = newGame();
    dispatch(state, { type: 'devSpawnCity', tileId: firstFoundableTile(state) });
    const human = humanOf(state);
    const city = Object.values(state.cities).find((c) => c.ownerId === human.id)!;
    const unitsBefore = Object.keys(state.units).length;
    expect(forceCompleteCurrentItem(state, [], city)).toBe(false);
    expect(Object.keys(state.units).length).toBe(unitsBefore);
  });
});
