import { describe, expect, it } from 'vitest';
import { generateGame } from '@/engine';
import { computeVisibleTiles, fogStateFor, revealAround } from '@/engine/systems/visibility';

const BASE = {
  seed: 42,
  preset: 'continents' as const,
  sizeId: 'duel',
  humanCivId: 'rome',
  aiCivIds: ['egypt', 'greece'],
  difficulty: 1,
};

describe('fog of war', () => {
  it('starts each player explored around their settler', () => {
    const state = generateGame(BASE);
    const human = state.players[0];
    const settler = Object.values(state.units).find((u) => u.ownerId === 0)!;
    const visible = computeVisibleTiles(state, human.id);
    expect(visible.has(settler.tileId)).toBe(true);
    expect(human.exploredTileIds).toContain(settler.tileId);
    // Sight radius 2 around the start is visible; the map is not fully revealed.
    expect(visible.size).toBeGreaterThan(10);
    expect(visible.size).toBeLessThan(state.map.tiles.length);
  });

  it('distinguishes hidden / remembered / visible', () => {
    const state = generateGame(BASE);
    const human = state.players[0];
    const settler = Object.values(state.units).find((u) => u.ownerId === 0)!;
    const visible = computeVisibleTiles(state, human.id);
    expect(fogStateFor(state, human.id, visible, settler.tileId)).toBe('visible');
    // Somewhere explored-but-far is remembered; somewhere unexplored is hidden.
    const farTile = state.map.tiles.findIndex((t) => !human.exploredTileIds.includes(t.id));
    expect(fogStateFor(state, human.id, visible, farTile)).toBe('hidden');
  });

  it('revealAround keeps exploredTileIds sorted and unique', () => {
    const state = generateGame(BASE);
    const human = state.players[0];
    const settler = Object.values(state.units).find((u) => u.ownerId === 0)!;
    revealAround(state, human.id, settler.tileId, 5);
    const sorted = [...human.exploredTileIds].sort((a, b) => a - b);
    expect(human.exploredTileIds).toEqual(sorted);
    expect(new Set(human.exploredTileIds).size).toBe(human.exploredTileIds.length);
  });
});
