import { describe, expect, it } from 'vitest';
import {
  HEAL_IN_CITY,
  HEAL_PER_TURN,
  XP_ON_HIT,
  XP_ON_KILL,
  canAttackUnit,
  captureCity,
  cityDefenseStrength,
  damageRoll,
  effectiveStrength,
  healUnits,
  promotionsEarned,
  resolveAttack,
  resolveCityAttack,
} from '@/engine/systems/combat';
import { offsetToAxial, hexDistance } from '@/engine/hex/axial';
import type { GameEvent } from '@/engine/core/events';
import type { GameState, PlayerId, Tile, Unit, UnitId } from '@/engine/core/types';

const W = 8;
const H = 6;

function makeState(opts?: { difficulty?: number; barbarians?: boolean }): GameState {
  const tiles: Tile[] = [];
  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W; col++) {
      const { q, r } = offsetToAxial(col, row);
      tiles.push({
        id: row * W + col,
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
    {
      id: 0 as PlayerId,
      civId: 'rome',
      isHuman: true,
      alive: true,
      gold: 50,
      researchedTechIds: ['agriculture'],
      scienceStored: 0,
      metPlayerIds: [1],
      relations: {},
      denouncedBy: [],
      warsWith: [1],
      denounceTurns: {},
      exploredTileIds: [],
    },
    {
      id: 1 as PlayerId,
      civId: 'egypt',
      isHuman: false,
      alive: true,
      gold: 50,
      researchedTechIds: ['agriculture'],
      scienceStored: 0,
      metPlayerIds: [0],
      relations: {},
      denouncedBy: [],
      warsWith: [0],
      denounceTurns: {},
      exploredTileIds: [],
      personality: { aggression: 0.3, expansionism: 0.6, scienceFocus: 0.6, defensiveness: 0.6 },
    },
  ];
  if (opts?.barbarians) {
    players.push({
      id: 2 as PlayerId,
      civId: 'barbarians',
      isHuman: false,
      alive: true,
      gold: 0,
      researchedTechIds: ['agriculture'],
      scienceStored: 0,
      metPlayerIds: [],
      relations: {},
      denouncedBy: [],
      warsWith: [],
      denounceTurns: {},
      exploredTileIds: [],
    });
  }
  return {
    version: 1,
    seed: 1,
    turn: 10,
    turnLimit: 250,
    difficulty: opts?.difficulty ?? 0,
    playerOrder: [0, 1],
    currentPlayerIndex: 0,
    map: { width: W, height: H, tiles },
    players,
    units: {},
    cities: {},
    barbarianCamps: [],
    nextUnitId: 0,
    nextCityId: 0,
    rngState: 987654321,
  };
}

function addUnit(
  state: GameState,
  typeId: string,
  ownerId: PlayerId,
  tileId: UnitId,
  overrides?: Partial<Unit>,
): Unit {
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
    ...overrides,
  };
  state.units[unit.id] = unit;
  return unit;
}

describe('combat math', () => {
  it('equal strengths roll ~30 damage (exactly 30 at U=1)', () => {
    const state = makeState();
    const a = addUnit(state, 'warrior', 0, 9);
    const d = addUnit(state, 'warrior', 1, 10);
    expect(damageRoll(state, a, d, 0.5)).toBe(30);
    // Bounds: U=0 -> 0.8x, U~1 -> 1.2x
    expect(damageRoll(state, a, d, 0)).toBe(Math.round(30 * 0.8));
    expect(damageRoll(state, a, d, 0.999)).toBeGreaterThanOrEqual(35);
  });

  it('strength advantage scales damage exponentially', () => {
    const state = makeState();
    const a = addUnit(state, 'warrior', 0, 9);
    const d = addUnit(state, 'warrior', 1, 10);
    a.promotions.push('shock'); // +3 str from content
    const boosted = damageRoll(state, a, d, 0.5);
    expect(boosted).toBe(Math.round(30 * Math.exp(0.045 * 3)));
  });

  it('wounded units fight weaker', () => {
    const state = makeState();
    const fresh = addUnit(state, 'warrior', 0, 9);
    const hurt = addUnit(state, 'warrior', 0, 10, { hp: 50 });
    const target = addUnit(state, 'warrior', 1, 11);
    expect(effectiveStrength(state, hurt)).toBeLessThan(effectiveStrength(state, fresh));
    void target;
  });

  it('melee requires adjacency; ranged bombards within range', () => {
    const state = makeState();
    // Tile 9 and 17 are adjacent (same row offset by one col in odd-r).
    const melee = addUnit(state, 'warrior', 0, 9);
    const far = addUnit(state, 'warrior', 1, 20); // several tiles away
    expect(canAttackUnit(state, melee, far)).toBe(false);
    const near = addUnit(state, 'warrior', 1, 10);
    expect(canAttackUnit(state, melee, near)).toBe(true);

    const archer = addUnit(state, 'archer', 0, 9);
    const dist2 = addUnit(state, 'warrior', 1, 11); // same row, two cols over
    expect(hexDistance(state.map.tiles[9].q, state.map.tiles[9].r, state.map.tiles[11].q, state.map.tiles[11].r)).toBe(2);
    expect(canAttackUnit(state, archer, dist2)).toBe(true); // dist 2 <= range 2
    expect(canAttackUnit(state, archer, far)).toBe(false); // dist 3 > range 2
    const spent = addUnit(state, 'archer', 0, 9, { attacksLeft: 0 });
    expect(canAttackUnit(state, spent, dist2)).toBe(false);
  });

  it('ranged attacks take no retaliation', () => {
    const state = makeState();
    const events: GameEvent[] = [];
    const archer = addUnit(state, 'archer', 0, 9);
    const victim = addUnit(state, 'warrior', 1, 20);
    const out = resolveAttack(state, events, archer, victim, 0.5);
    expect(out.dmgToAttacker).toBe(0);
    expect(out.attackerDied).toBe(false);
    expect(victim.hp).toBeLessThan(100);
    expect(archer.hp).toBe(100);
  });

  it('kills grant XP, emit events and remove the dead unit', () => {
    const state = makeState();
    const events: GameEvent[] = [];
    const killer = addUnit(state, 'warrior', 0, 9);
    const prey = addUnit(state, 'warrior', 1, 10, { hp: 5 });
    const out = resolveAttack(state, events, killer, prey, 0.5);
    expect(out.defenderDied).toBe(true);
    expect(state.units[prey.id]).toBeUndefined();
    expect(killer.xp).toBe(XP_ON_KILL);
    expect(events.some((e) => e.kind === 'unitKilled')).toBe(true);
    expect(events.some((e) => e.kind === 'combatResolved')).toBe(true);
  });

  it('survivors gain hit XP and promote at thresholds', () => {
    const state = makeState();
    const events: GameEvent[] = [];
    const a = addUnit(state, 'warrior', 0, 9, { xp: 14 });
    const b = addUnit(state, 'warrior', 1, 10, { hp: 40 });
    resolveAttack(state, events, a, b, 0.5); // both survive -> +2 xp each
    expect(a.xp).toBe(14 + XP_ON_HIT);
    expect(b.xp).toBe(XP_ON_HIT);
    expect(promotionsEarned(14)).toBe(0);
    expect(promotionsEarned(15)).toBe(1);
    expect(promotionsEarned(61)).toBe(3);
    expect(events.some((e) => e.kind === 'unitPromoted')).toBe(true);
    expect(a.promotions.length).toBe(1);
  });

  it('mutual lethal damage leaves a winner', () => {
    const state = makeState();
    const a = addUnit(state, 'warrior', 0, 9, { hp: 3 });
    const b = addUnit(state, 'warrior', 1, 10, { hp: 3 });
    const out = resolveAttack(state, events0(), a, b, 0.5);
    expect(out.attackerDied && out.defenderDied).toBe(false);
  });
});

function events0(): GameEvent[] {
  return [];
}

describe('cities under siege', () => {
  function cityAt(state: GameState, ownerId: PlayerId, tileId: number) {
    state.cities[0] = {
      id: 0,
      name: 'Testburg',
      ownerId,
      tileId,
      population: 4,
      foodStored: 0,
      productionQueue: [],
      productionStored: 0,
      buildings: ['palace', 'monument'],
      cultureStored: 0,
      ownedTileIds: [tileId - 1, tileId, tileId + 1],
      hp: 200,
      originalOwnerId: ownerId,
      everCaptured: false,
    };
    for (const tid of state.cities[0].ownedTileIds) {
      state.map.tiles[tid].ownerPlayerId = ownerId;
      state.map.tiles[tid].cityId = 0;
    }
    return state.cities[0];
  }

  it('ranged bombardment damages the city safely', () => {
    const state = makeState();
    const city = cityAt(state, 1, 11); // exactly 2 tiles from the archer
    const archer = addUnit(state, 'archer', 0, 9);
    const events: GameEvent[] = [];
    const ok = resolveCityAttack(state, events, archer, city.id, 0.5);
    expect(ok).toBe(true);
    expect(city.hp).toBeLessThan(200);
    expect(archer.hp).toBe(100);
    expect(city.ownerId).toBe(1);
  });

  it('melee capture at zero hp flips owner, halves pop, strips palace', () => {
    const state = makeState();
    const city = cityAt(state, 1, 20);
    city.hp = 0;
    const attacker = addUnit(state, 'warrior', 0, 19);
    const events: GameEvent[] = [];
    const ok = resolveCityAttack(state, events, attacker, city.id, 0.5);
    expect(ok).toBe(true);
    expect(city.ownerId).toBe(0);
    expect(city.originalOwnerId).toBe(1); // domination bookkeeping preserved
    expect(city.everCaptured).toBe(true);
    expect(city.population).toBe(2);
    expect(city.buildings).not.toContain('palace');
    expect(city.productionQueue).toHaveLength(0);
    for (const tid of city.ownedTileIds) {
      expect(state.map.tiles[tid].ownerPlayerId).toBe(0);
    }
    expect(events.some((e) => e.kind === 'cityCaptured')).toBe(true);
  });

  it('barbarians plunder zero-hp cities instead of capturing', () => {
    const state = makeState({ barbarians: true });
    const city = cityAt(state, 0, 20);
    city.hp = 0;
    const victim = state.players[0];
    const before = victim.gold;
    const raider = addUnit(state, 'warrior', 2, 19);
    const events: GameEvent[] = [];
    resolveCityAttack(state, events, raider, city.id, 0.5);
    expect(city.ownerId).toBe(0); // no flip
    expect(city.hp).toBeGreaterThan(0);
    expect(victim.gold).toBeLessThan(before);
  });

  it('city defense strength grows with population and garrison', () => {
    const state = makeState();
    const city = cityAt(state, 0, 20);
    const bare = cityDefenseStrength(state, city.id);
    addUnit(state, 'warrior', 0, 20);
    expect(cityDefenseStrength(state, city.id)).toBeGreaterThan(bare);
  });
});

describe('healing', () => {
  it('heals 10/turn in the field and 20/turn in own city', () => {
    const state = makeState();
    const field = addUnit(state, 'warrior', 0, 9, { hp: 55 });
    const home = addUnit(state, 'warrior', 0, 20, { hp: 55 });
    state.cities[0] = {
      id: 0,
      name: 'Home',
      ownerId: 0,
      tileId: 20,
      population: 1,
      foodStored: 0,
      productionQueue: [],
      productionStored: 0,
      buildings: [],
      cultureStored: 0,
      ownedTileIds: [20],
      hp: 200,
      originalOwnerId: 0,
      everCaptured: false,
    };
    state.map.tiles[20].cityId = 0;
    healUnits(state, 0);
    expect(field.hp).toBe(55 + HEAL_PER_TURN);
    expect(home.hp).toBe(55 + HEAL_IN_CITY);
  });

  it('never overheals and skips other players units', () => {
    const state = makeState();
    const full = addUnit(state, 'warrior', 0, 9, { hp: 97 });
    const foe = addUnit(state, 'warrior', 1, 10, { hp: 30 });
    healUnits(state, 0);
    expect(full.hp).toBe(100);
    expect(foe.hp).toBe(30);
  });
});

describe('captureCity direct', () => {
  it('is a no-op on missing city or attacker', () => {
    const state = makeState();
    const events: GameEvent[] = [];
    const ghost = addUnit(state, 'warrior', 0, 9);
    delete state.units[ghost.id];
    expect(() => captureCity(state, events, 42, ghost)).not.toThrow();
    expect(events).toHaveLength(0);
  });
});
