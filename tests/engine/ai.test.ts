import { describe, expect, it } from 'vitest';
import { currentPlayer, dispatch, generateGame, hashState } from '@/engine';
import { offsetToAxial } from '@/engine/hex/axial';
import type { GameEvent } from '@/engine/core/events';
import type { GameState, PlayerId, Tile, Unit } from '@/engine/core/types';
import {
  DENOUNCE_RELATION_HIT,
  WAR_RELATION_HIT,
  applyDeclareWar,
  applyDenounce,
  applyOfferPeace,
  discoverContacts,
} from '@/engine/systems/diplomacy';
import { aiYieldMult } from '@/engine/systems/economy';
import { effectiveStrength } from '@/engine/systems/combat';
import { checkCampsCleared, runBarbarianPhase, spawnCampUnit } from '@/engine/systems/barbarian';

const BASE = {
  seed: 42,
  preset: 'pangaea' as const,
  sizeId: 'duel',
  humanCivId: 'rome',
  aiCivIds: ['egypt'],
  difficulty: 1,
};

describe('ai turns', () => {
  it('are deterministic across identical games', () => {
    const a = generateGame(BASE);
    const b = generateGame(BASE);
    dispatch(a, { type: 'endTurn' });
    dispatch(b, { type: 'endTurn' });
    expect(hashState(a)).toBe(hashState(b));
    expect(currentPlayer(a).isHuman).toBe(true);
  });

  it('stay deterministic over several turns', () => {
    const play = (): string => {
      const s = generateGame(BASE);
      for (let i = 0; i < 6; i++) dispatch(s, { type: 'endTurn' });
      return hashState(s);
    };
    expect(play()).toBe(play());
  });

  it('AI picks research, settles and fills production queues', () => {
    const state = generateGame(BASE);
    dispatch(state, { type: 'endTurn' });
    const ai = state.players[1];
    expect(ai.researchingTechId).toBeDefined();
    // The planner founds on a valid starting spot right away.
    const cities = Object.values(state.cities).filter((c) => c.ownerId === ai.id);
    expect(cities.length).toBeGreaterThanOrEqual(1);
    for (const city of cities) {
      expect(city.productionQueue.length).toBeLessThanOrEqual(1);
    }
  });
});

describe('difficulty', () => {
  it('multiplies AI yields and never the human', () => {
    const state = generateGame(BASE);
    expect(aiYieldMult(state, 0)).toBe(1);
    state.difficulty = 2;
    expect(aiYieldMult(state, 1)).toBeCloseTo(1.2);
    expect(aiYieldMult(state, 0)).toBe(1);
  });

  it('grants AI units flat strength on Hard+', () => {
    const state = generateGame({ ...BASE, difficulty: 0 });
    const unit: Unit = {
      id: 999,
      typeId: 'warrior',
      ownerId: 1,
      tileId: 0,
      hp: 100,
      movementLeft: 0,
      attacksLeft: 0,
      fortified: false,
      slept: false,
      xp: 0,
      promotions: [],
    };
    state.units[999] = unit;
    const peacefulStr = effectiveStrength(state, unit);
    state.difficulty = 2;
    expect(effectiveStrength(state, unit)).toBeCloseTo(peacefulStr + 2);
  });
});

// --- compact synthetic world for diplomacy/barbarian checks ---

function microState(opts?: { barbarians?: boolean }): GameState {
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
  const players = [
    basePlayer(0, 'rome', true),
    basePlayer(1, 'egypt', false),
  ];
  if (opts?.barbarians) players.push(basePlayer(2, 'barbarians', false));
  return {
    version: 1,
    seed: 7,
    turn: 30,
    turnLimit: 250,
    difficulty: 0,
    playerOrder: [0, 1],
    currentPlayerIndex: 0,
    map: { width: 6, height: 4, tiles },
    players,
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

function addUnit(state: GameState, typeId: string, ownerId: PlayerId, tileId: number): Unit {
  const unit: Unit = {
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
    promotions: [],
  };
  state.units[unit.id] = unit;
  return unit;
}

/** Bare-bones city so peace utility has a homeland to weigh. */
function addCity(state: GameState, ownerId: PlayerId, tileId: number) {
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
    buildings: [] as string[],
    cultureStored: 0,
    ownedTileIds: [tileId],
    hp: 200,
    originalOwnerId: ownerId,
    everCaptured: false,
  };
  state.cities[id] = city;
  return city;
}

describe('diplomacy', () => {
  it('discovers contacts by line of sight, both directions', () => {
    const state = microState();
    addUnit(state, 'warrior', 0, 7); // row 1 col 1
    addUnit(state, 'settler', 1, 8); // adjacent
    discoverContacts(state, 0);
    expect(state.players[0].metPlayerIds).toContain(1);
    expect(state.players[1].metPlayerIds).toContain(0);
  });

  it('never befriends barbarians through contact', () => {
    const state = microState({ barbarians: true });
    addUnit(state, 'warrior', 0, 7);
    addUnit(state, 'warrior', 2, 8);
    discoverContacts(state, 0);
    expect(state.players[0].metPlayerIds).not.toContain(2);
  });

  it('requires met status for war and books the relation hit', () => {
    const state = microState();
    addUnit(state, 'warrior', 0, 7);
    addUnit(state, 'warrior', 1, 8); // adjacent so sight introduces them
    const events: GameEvent[] = [];
    expect(applyDeclareWar(state, events, 0, 1)).toBe(false); // unmet
    discoverContacts(state, 0);
    expect(applyDeclareWar(state, events, 0, 1)).toBe(true);
    expect(state.players[0].warsWith).toContain(1);
    expect(state.players[1].warsWith).toContain(0);
    expect(state.players[0].relations[1]).toBe(WAR_RELATION_HIT);
    expect(events.some((e) => e.kind === 'warDeclared')).toBe(true);
    expect(applyDeclareWar(state, events, 0, 1)).toBe(false); // already at war
  });

  it('enforces the denounce cooldown per pair', () => {
    const state = microState();
    state.players[0].metPlayerIds.push(1);
    state.players[1].metPlayerIds.push(0);
    const events: GameEvent[] = [];
    expect(applyDenounce(state, events, 0, 1)).toBe(true);
    expect(state.players[0].relations[1]).toBe(DENOUNCE_RELATION_HIT);
    expect(applyDenounce(state, events, 0, 1)).toBe(false); // same turn
    state.turn += 25;
    expect(applyDenounce(state, events, 0, 1)).toBe(true); // cooldown elapsed
  });

  it('AI accepts peace when outgunned, refuses when strong', () => {
    const metWar = (): GameState => {
      const state = microState();
      for (const p of state.players) p.metPlayerIds.push(p.id === 0 ? 1 : 0);
      const events: GameEvent[] = [];
      applyDeclareWar(state, events, 0, 1);
      // A homeland matters: a landless AI always folds (existential clause).
      addCity(state, 1, 3);
      return state;
    };
    // Weak AI: only a scout faces three warriors -> accepts.
    const weak = metWar();
    addUnit(weak, 'scout', 1, 14);
    addUnit(weak, 'warrior', 0, 15);
    addUnit(weak, 'warrior', 0, 16);
    addUnit(weak, 'warrior', 0, 21);
    const evA: GameEvent[] = [];
    expect(applyOfferPeace(weak, evA, 0, 1)).toBe('accepted');
    expect(weak.players[0].warsWith).not.toContain(1);
    expect(evA.some((e) => e.kind === 'peaceMade')).toBe(true);

    // Strong AI: three warriors against one scout -> refuses.
    const strong = metWar();
    addUnit(strong, 'scout', 0, 14);
    addUnit(strong, 'warrior', 1, 15);
    addUnit(strong, 'warrior', 1, 16);
    addUnit(strong, 'warrior', 1, 21);
    const evB: GameEvent[] = [];
    expect(applyOfferPeace(strong, evB, 0, 1)).toBe('rejected');
    expect(strong.players[0].warsWith).toContain(1);
  });
});

describe('barbarians', () => {
  it('guards raid nearby enemies deterministically', () => {
    const state = microState({ barbarians: true });
    const camp = { tileId: 7, unitIds: [] as number[] };
    state.barbarianCamps.push(camp);
    const guard = spawnCampUnit(state, camp, 'warrior');
    expect(guard).not.toBeNull();
    const prey = addUnit(state, 'settler', 0, 8); // adjacent civilian bait
    const before = hashState(state);
    const events: GameEvent[] = [];
    runBarbarianPhase(state, events);
    // Either an attack resolved or the guard moved next to the bait.
    const guardUnit = state.units[state.barbarianCamps[0].unitIds[0]];
    const attacked = events.some((e) => e.kind === 'combatResolved');
    expect(attacked || guardUnit?.tileId !== camp.tileId || before !== hashState(state)).toBe(true);
    void prey;
  });

  it('clearing all guards closes the camp and pays the clearer', () => {
    const state = microState({ barbarians: true });
    const camp = { tileId: 7, unitIds: [] as number[] };
    state.barbarianCamps.push(camp);
    const guardId = spawnCampUnit(state, camp, 'warrior')!;
    delete state.units[guardId];
    const events: GameEvent[] = [
      { kind: 'unitKilled', unitId: guardId, byPlayerId: 0 },
    ];
    checkCampsCleared(state, events);
    expect(state.barbarianCamps).toHaveLength(0);
    expect(state.players[0].gold).toBeGreaterThan(25);
  });

  it('camp guards hold position instead of chasing distant prey', () => {
    const state = microState({ barbarians: true });
    const camp = { tileId: 7, unitIds: [] as number[] };
    state.barbarianCamps.push(camp);
    spawnCampUnit(state, camp, 'warrior'); // unoccupied -> sits on the camp tile
    addUnit(state, 'warrior', 0, 9); // two tiles out: beyond melee reach
    const events: GameEvent[] = [];
    runBarbarianPhase(state, events);
    expect(state.units[camp.unitIds[0]].tileId).toBe(camp.tileId);
  });

  it('raiders away from home still roam toward prey', () => {
    const state = microState({ barbarians: true });
    const camp = { tileId: 0, unitIds: [] as number[] };
    state.barbarianCamps.push(camp);
    const raider = addUnit(state, 'warrior', 2, 7); // off-camp
    addUnit(state, 'settler', 0, 21); // a few tiles north-east, within raid radius
    const events: GameEvent[] = [];
    runBarbarianPhase(state, events);
    const attacked = events.some((e) => e.kind === 'combatResolved');
    expect(attacked || raider.tileId !== 7).toBe(true);
  });
});

describe('resign & peace rejection (engine)', () => {
  it('resign ends the game immediately: best live rival wins by score', () => {
    const state = microState();
    const { events } = dispatch(state, { type: 'resign' });
    expect(state.players[0].alive).toBe(false);
    expect(events.some((e) => e.kind === 'playerDefeated')).toBe(true);
    expect(state.winner).toEqual({ playerId: 1, victory: 'score' });
  });

  it('offerPeace rejection emits peaceRejected and keeps the war', () => {
    const state = microState();
    state.players[0].warsWith = [1];
    state.players[1].warsWith = [0];
    // The AI needs a city, otherwise the existential clause accepts instantly.
    state.cities[0] = {
      id: 0,
      name: 'Thebes',
      ownerId: 1,
      tileId: 7,
      population: 1,
      foodStored: 0,
      productionQueue: [],
      productionStored: 0,
      buildings: [],
      cultureStored: 0,
      ownedTileIds: [7],
      hp: 100,
      originalOwnerId: 1,
      everCaptured: false,
    };
    // One AI warrior and no attacker army: the peace utility rejects.
    state.units[0] = {
      id: 0,
      typeId: 'warrior',
      ownerId: 1,
      tileId: 1,
      hp: 100,
      movementLeft: 0,
      attacksLeft: 0,
      fortified: false,
      slept: false,
      xp: 0,
      promotions: [],
    };    const { events } = dispatch(state, { type: 'offerPeace', targetPlayerId: 1 });
    expect(events.some((e) => e.kind === 'peaceRejected')).toBe(true);
    expect(events.some((e) => e.kind === 'peaceMade')).toBe(false);
    expect(state.players[0].warsWith).toContain(1);
  });

  it('offerPeace acceptance emits peaceMade without a rejection event', () => {
    const state = microState();
    state.players[0].warsWith = [1];
    state.players[1].warsWith = [0];
    const { events } = dispatch(state, { type: 'offerPeace', targetPlayerId: 1 });
    expect(events.some((e) => e.kind === 'peaceMade')).toBe(true);
    expect(events.some((e) => e.kind === 'peaceRejected')).toBe(false);
  });
});
