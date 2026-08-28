import { describe, expect, it } from 'vitest';
import { currentPlayer, computeScore, dispatch, generateGame, hashState } from '@/engine';
import { offsetToAxial } from '@/engine/hex/axial';
import type { GameEvent } from '@/engine/core/events';
import type { CityId, GameState, PlayerId, Tile } from '@/engine/core/types';
import { captureCity } from '@/engine/systems/combat';
import {
  awardScoreVictory,
  checkDomination,
  checkEliminations,
  holdsAllOriginalCapitals,
} from '@/engine/systems/victory';

// --- compact synthetic world (same pattern as ai.test.ts) ---

function microState(): GameState {
  const tiles: Tile[] = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 6; col++) {
      const { q, r } = offsetToAxial(col, row);
      tiles.push({
        id: row * 6 + col,
        q,
        r,
        terrain: 'grassland',
        elevation: 'flat',
        features: [],
        riverEdges: [false, false, false, false, false, false],
      });
    }
  }
  return {
    version: 1,
    seed: 7,
    turn: 30,
    turnLimit: 250,
    difficulty: 0,
    playerOrder: [0, 1],
    currentPlayerIndex: 0,
    map: { width: 6, height: 4, tiles },
    players: [basePlayer(0, 'rome', true), basePlayer(1, 'egypt', false)],
    units: {},
    cities: {},
    barbarianCamps: [],
    nextUnitId: 0,
    nextCityId: 0,
    rngState: 42,
  };
}

function basePlayer(id: PlayerId, civId: string, isHuman: boolean) {
  return {
    id,
    civId,
    isHuman,
    alive: true,
    gold: 25,
    researchedTechIds: ['agriculture'],
    scienceStored: 0,
    metPlayerIds: [] as PlayerId[],
    relations: {} as Record<number, number>,
    denouncedBy: [] as PlayerId[],
    warsWith: [] as PlayerId[],
    denounceTurns: {} as Record<number, number>,
    exploredTileIds: [] as number[],
    ...(isHuman ? {} : { personality: { aggression: 0.5, expansionism: 0.5, scienceFocus: 0.5, defensiveness: 0.5 } }),
  };
}

function addUnit(state: GameState, typeId: string, ownerId: PlayerId, tileId: number) {
  const unit = {
    id: state.nextUnitId++,
    typeId,
    ownerId,
    tileId,
    hp: 100,
    movementLeft: 2,
    attacksLeft: 1,
    fortified: false,
    slept: false,
    xp: 0,
    promotions: [] as string[],
  };
  state.units[unit.id] = unit;
  return unit;
}

function addCity(state: GameState, ownerId: PlayerId, tileId: number, opts?: { wonder?: boolean }) {
  const id = state.nextCityId++;
  const city = {
    id,
    name: `Testburg ${id}`,
    ownerId,
    tileId,
    population: 2,
    foodStored: 0,
    productionQueue: [],
    productionStored: 0,
    buildings: opts?.wonder ? ['pyramids'] : ([] as string[]),
    cultureStored: 0,
    ownedTileIds: [tileId],
    hp: 200,
    originalOwnerId: ownerId,
    everCaptured: false,
  };
  state.cities[id] = city;
  state.players[ownerId].originalCapitalCityId = id;
  return city;
}

describe('score', () => {
  it('follows the GAME_DESIGN §11 formula', () => {
    const state = microState();
    addCity(state, 0, 7); // no wonders exist in content yet — wonder term is 0
    const city = Object.values(state.cities)[0];
    city.population = 3;
    city.ownedTileIds = [7, 8, 9, 10, 11];
    state.players[0].researchedTechIds = ['agriculture', 'pottery'];
    // cities×3 + pop×2 + tiles×0.25 + techs×4 + wonders×5
    expect(computeScore(state, 0)).toBeCloseTo(1 * 3 + 3 * 2 + 5 * 0.25 + 2 * 4 + 0 * 5);
  });

  it('ignores foreign cities and dead players', () => {
    const state = microState();
    addCity(state, 0, 7);
    addCity(state, 1, 8);
    expect(computeScore(state, 0)).toBeLessThan(computeScore(state, 0) + computeScore(state, 1));
    state.players[1].alive = false;
    expect(computeScore(state, 1)).toBeGreaterThan(0); // score still computable for standings
  });
});

describe('domination', () => {
  it('triggers when the last rival original capital changes hands', () => {
    const state = microState();
    const mine = addCity(state, 0, 7);
    const theirs = addCity(state, 1, 8);
    const attacker = addUnit(state, 'warrior', 0, 13); // adjacent to tile 8

    checkDomination(state, []);
    expect(state.winner).toBeUndefined(); // both capitals still stand

    const events: GameEvent[] = [];
    captureCity(state, events, theirs.id, attacker);
    expect(state.winner).toEqual({ playerId: 0, victory: 'domination' });
    expect(events.some((e) => e.kind === 'victoryAchieved' && e.victory === 'domination')).toBe(true);
    expect(mine.ownerId).toBe(0);
  });

  it('does not trigger while a rival capital is unconquered', () => {
    const state = microState();
    addCity(state, 0, 7);
    addCity(state, 1, 8);
    const events: GameEvent[] = [];
    checkDomination(state, events);
    expect(state.winner).toBeUndefined();
    expect(events).toHaveLength(0);
  });

  it('requires holding your own original capital too', () => {
    const state = microState();
    const mine = addCity(state, 0, 7);
    const theirs = addCity(state, 1, 8);
    // Rome lost its own capital to Egypt but holds Egypt's.
    mine.ownerId = 1;
    mine.everCaptured = true;
    expect(holdsAllOriginalCapitals(state, 0)).toBe(false);
    expect(holdsAllOriginalCapitals(state, 1)).toBe(true);
    void theirs;
  });

  it('ignores eliminated rivals that never founded a capital', () => {
    const state = microState();
    addCity(state, 0, 7); // only player 0 ever settled
    // Player 1 was eliminated in the field (settler died, no cities).
    state.players[1].alive = false;
    expect(holdsAllOriginalCapitals(state, 0)).toBe(true);
    // A live rival without a capital still blocks (their settler may settle).
    state.players[1].alive = true;
    expect(holdsAllOriginalCapitals(state, 0)).toBe(false);
  });
});

describe('elimination', () => {
  it('removes players who lose their last city with no settlers left', () => {
    const state = microState();
    addCity(state, 0, 7);
    const theirs = addCity(state, 1, 8);
    const attacker = addUnit(state, 'warrior', 0, 13);
    const events: GameEvent[] = [];
    captureCity(state, events, theirs.id, attacker);
    expect(state.players[1].alive).toBe(false);
    expect(events.some((e) => e.kind === 'playerDefeated' && e.playerId === 1)).toBe(true);
  });

  it('keeps a cityless player alive while a settler roams', () => {
    const state = microState();
    addCity(state, 0, 7); // the human keeps a city so only p1 is under test
    addUnit(state, 'settler', 1, 8);
    const events: GameEvent[] = [];
    checkEliminations(state, events);
    expect(state.players[1].alive).toBe(true);
    expect(events).toHaveLength(0);
  });

  it('never eliminates the barbarian pseudo-player', () => {
    const state = microState();
    state.players.push(basePlayer(2, 'barbarians', false));
    state.playerOrder = [0, 1];
    const events: GameEvent[] = [];
    checkEliminations(state, events);
    expect(state.players[2].alive).toBe(true);
  });
});

describe('score victory', () => {
  it('crowns the highest score when the turn limit passes', () => {
    const state = generateGame({
      seed: 42,
      preset: 'pangaea',
      sizeId: 'duel',
      humanCivId: 'rome',
      aiCivIds: ['egypt'],
      difficulty: 1,
    });
    state.turn = state.turnLimit;
    // Egypt gets an extra city so the AI wins the score race deterministically.
    const aiCityId = state.nextCityId;
    state.cities[aiCityId] = {
      id: aiCityId,
      name: 'Second City',
      ownerId: 1,
      tileId: 0,
      population: 5,
      foodStored: 0,
      productionQueue: [],
      productionStored: 0,
      buildings: [],
      cultureStored: 0,
      ownedTileIds: [0, 1, 2],
      hp: 200,
      originalOwnerId: 1,
      everCaptured: false,
    };
    const events = dispatch(state, { type: 'endTurn' }).events;
    expect(state.winner).toEqual({ playerId: 1, victory: 'score' });
    expect(events.some((e) => e.kind === 'victoryAchieved' && e.victory === 'score')).toBe(true);
    expect(computeScore(state, 1)).toBeGreaterThan(computeScore(state, 0));
  });

  it('does not fire before the turn limit', () => {
    const state = generateGame({
      seed: 42,
      preset: 'pangaea',
      sizeId: 'duel',
      humanCivId: 'rome',
      aiCivIds: ['egypt'],
      difficulty: 1,
    });
    state.turn = state.turnLimit - 1;
    dispatch(state, { type: 'endTurn' }); // wrap lands exactly on the limit, not past it
    expect(state.turn).toBe(state.turnLimit);
    expect(state.winner).toBeUndefined();
  });

  it('awards directly when called (used by tests and future hooks)', () => {
    const state = microState();
    addCity(state, 0, 7);
    const events: GameEvent[] = [];
    awardScoreVictory(state, events);
    expect(state.winner).toEqual({ playerId: 0, victory: 'score' });
  });
});

describe('post-victory dispatch', () => {
  it('short-circuits every command once a winner exists', () => {
    const state = microState();
    const unit = addUnit(state, 'warrior', 0, 7);
    state.winner = { playerId: 0, victory: 'domination' };
    const before = hashState(state);
    const moved = dispatch(state, { type: 'moveUnit', unitId: unit.id, path: [7, 8] });
    expect(moved.events).toHaveLength(0);
    expect(hashState(state)).toBe(before);
    expect(currentPlayer(state).id).toBe(0);
  });
});

describe('capital bookkeeping', () => {
  it('records the first founded city as the original capital', () => {
    const state = generateGame({
      seed: 42,
      preset: 'pangaea',
      sizeId: 'duel',
      humanCivId: 'rome',
      aiCivIds: ['egypt'],
      difficulty: 1,
    });
    expect(state.players[0].originalCapitalCityId).toBeUndefined();
    const settler = Object.values(state.units).find((u) => u.ownerId === 0 && u.typeId === 'settler');
    expect(settler).toBeDefined();
    // Found on the starting tile (always legal).
    dispatch(state, { type: 'foundCity', unitId: settler!.id });
    const capitalId = state.players[0].originalCapitalCityId;
    expect(capitalId).toBeDefined();
    expect(state.cities[capitalId as CityId].ownerId).toBe(0);
  });
});
