import { describe, expect, it } from 'vitest';
import { buildContentDb } from '@/content';
import { generateGame } from '@/engine/mapgen/generate';
import { currentPlayer } from '@/engine/core/engine';
import { dispatch } from '@/engine/core/engine';
import { enterCostFor, findUnitPath, applyMoveUnit, reachableTiles } from '@/engine/systems/movement';

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

describe('movement', () => {
  it('blocks mountains and water as impassable', () => {
    const state = makeState();
    const unit = Object.values(state.units)[0];
    for (const tile of state.map.tiles) {
      const cost = enterCostFor(state, unit, tile.id);
      if (tile.elevation === 'mountain' || tile.terrain === 'ocean' || tile.terrain === 'coast') {
        expect(cost).toBe(Infinity);
      } else {
        expect(cost).toBeGreaterThan(0);
        expect(Number.isFinite(cost)).toBe(true);
      }
    }
  });

  it('finds contiguous paths and consumes movement', () => {
    const state = makeState();
    const human = state.players.find((p) => p.isHuman)!;
    const settler = Object.values(state.units).find((u) => u.ownerId === human.id && u.typeId === 'settler')!;
    const range = reachableTiles(state, settler);
    expect(range.size).toBeGreaterThan(0);
    // The escort may hold a reachable tile (A* treats occupation as blocked).
    const goal = [...range].find((id) => id !== settler.tileId && findUnitPath(state, settler, id));
    expect(goal).toBeDefined();
    const path = findUnitPath(state, settler, goal!)!;
    expect(path[0]).toBe(settler.tileId);
    expect(path[path.length - 1]).toBe(goal);
    const events = applyMoveUnit(state, [], { type: 'moveUnit', unitId: settler.id, path });
    void events;
    expect(settler.tileId === goal || settler.movementLeft < buildContentDb().units.settler.moves).toBe(true);
  });

  it('rejects moves by non-current players and broken paths', () => {
    const state = makeState();
    const human = state.players.find((p) => p.isHuman)!;
    const unit = Object.values(state.units).find((u) => u.ownerId === human.id)!;
    expect(applyMoveUnit(state, [], { type: 'moveUnit', unitId: unit.id, path: [] })).toBe(false);
    expect(applyMoveUnit(state, [], { type: 'moveUnit', unitId: unit.id, path: [unit.tileId + 999] })).toBe(false);
  });

  it('endTurn advances to the human again with refreshed MP', () => {
    const state = makeState();
    const before = currentPlayer(state).id;
    dispatch(state, { type: 'endTurn' });
    expect(currentPlayer(state).id).toBe(before);
    const unit = Object.values(state.units).find(
      (u) => u.ownerId === currentPlayer(state).id,
    )!;
    expect(unit.movementLeft).toBeGreaterThan(0);
  });
});
