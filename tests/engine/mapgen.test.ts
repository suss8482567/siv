import { describe, expect, it } from 'vitest';
import { generateGame, hashState, hexDistance, tilesInRange } from '@/engine';
import { buildContentDb } from '@/content';
import { axialToOffset } from '@/engine/hex/axial';

function offsetIndexOf(q: number, r: number, state: ReturnType<typeof generateGame>): number {
  const { col, row } = axialToOffset(q, r);
  if (col < 0 || col >= state.map.width || row < 0 || row >= state.map.height) return -1;
  return row * state.map.width + col;
}

const BASE = {
  seed: 42,
  preset: 'continents' as const,
  sizeId: 'duel',
  humanCivId: 'rome',
  aiCivIds: ['egypt', 'greece'],
  difficulty: 1,
};

describe('map generation', () => {
  it('is deterministic: same options, same state hash', () => {
    const a = hashState(generateGame(BASE));
    const b = hashState(generateGame(BASE));
    expect(a).toBe(b);
  });

  it('differs across seeds', () => {
    const a = hashState(generateGame({ ...BASE, seed: 42 }));
    const b = hashState(generateGame({ ...BASE, seed: 43 }));
    expect(a).not.toBe(b);
  });

  it('spawns each escort beside its settler, on walkable land', () => {
    const state = generateGame(BASE);
    const civCount = 1 + BASE.aiCivIds.length;
    let pairs = 0;
    for (let pid = 0; pid < civCount; pid++) {
      const settler = Object.values(state.units).find(
        (u) => u.ownerId === pid && u.typeId === 'settler',
      )!;
      const warrior = Object.values(state.units).find(
        (u) => u.ownerId === pid && u.typeId === 'warrior',
      )!;
      const st = state.map.tiles[settler.tileId];
      const wt = state.map.tiles[warrior.tileId];
      expect(wt.terrain).not.toBe('ocean');
      expect(wt.terrain).not.toBe('coast');
      expect(wt.elevation).not.toBe('mountain');
      expect(hexDistance(st.q, st.r, wt.q, wt.r)).toBeLessThanOrEqual(1);
      pairs += 1;
    }
    expect(pairs).toBe(civCount);
  });

  it('places every civ start on habitable land', () => {
    const content = buildContentDb();
    const state = generateGame(BASE);
    const civCount = 1 + BASE.aiCivIds.length;
    let startsFound = 0;
    for (const unit of Object.values(state.units)) {
      if (content.units[unit.typeId].unitClass !== 'civilian') continue;
      const tile = state.map.tiles[unit.tileId];
      expect(tile.terrain).not.toBe('ocean');
      expect(tile.elevation).not.toBe('mountain');
      startsFound += 1;
    }
    expect(startsFound).toBe(civCount);
  });

  it('creates the expected player roster', () => {
    const state = generateGame(BASE);
    // 3 real civs + the barbarian pseudo-player appended last.
    expect(state.players).toHaveLength(4);
    expect(state.players[0].isHuman).toBe(true);
    expect(state.players[0].exploredTileIds.length).toBeGreaterThan(0);
    expect(state.players[3].civId).toBe('barbarians');
    expect(state.playerOrder).toHaveLength(3); // barbarians stay out of turn order
  });

  it('seeds barbarian camps away from every start', () => {
    const state = generateGame(BASE);
    expect(state.barbarianCamps.length).toBeGreaterThan(0);
    const settlers = Object.values(state.units).filter(
      (u) => buildContentDb().units[u.typeId].unitClass === 'civilian',
    );
    for (const camp of state.barbarianCamps) {
      expect(camp.unitIds.length).toBeGreaterThan(0);
      for (const unitId of camp.unitIds) {
        expect(state.units[unitId].ownerId).toBe(state.players.length - 1);
      }
      const c = state.map.tiles[camp.tileId];
      for (const settler of settlers) {
        const s = state.map.tiles[settler.tileId];
        expect(hexDistance(c.q, c.r, s.q, s.r)).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('carves at least one river across several seeds', () => {
    for (const seed of [42, 7, 2024]) {
      const state = generateGame({ ...BASE, seed });
      const riverTiles = state.map.tiles.filter((t) => t.riverEdges.some(Boolean));
      expect(riverTiles.length).toBeGreaterThan(0);
    }
  });

  it('scatters features and resources', () => {
    const state = generateGame(BASE);
    const withFeature = state.map.tiles.filter((t) => t.features.length > 0);
    const withResource = state.map.tiles.filter((t) => t.resourceId);
    expect(withFeature.length).toBeGreaterThan(10);
    expect(withResource.length).toBeGreaterThan(5);
  });

  it('guarantees luxury + strategic resources near every start', () => {
    const content = buildContentDb();
    const state = generateGame(BASE);
    const settlers = Object.values(state.units).filter(
      (u) => content.units[u.typeId].unitClass === 'civilian',
    );
    expect(settlers.length).toBeGreaterThan(0);
    for (const settler of settlers) {
      const center = state.map.tiles[settler.tileId];
      const kinds = new Set<string>();
      for (const t of tilesInRange(center.q, center.r, 3)) {
        const idx = offsetIndexOf(t.q, t.r, state);
        if (idx < 0) continue;
        const rid = state.map.tiles[idx].resourceId;
        if (rid) kinds.add(content.resources[rid].kind);
      }
      expect(kinds.has('luxury'), `luxury near start tile ${center.id}`).toBe(true);
      expect(kinds.has('strategic'), `strategic near start tile ${center.id}`).toBe(true);
    }
  });
});

