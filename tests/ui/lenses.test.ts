import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dispatch, generateGame } from '@/engine';
import { canFoundCityAt } from '@/engine/systems/cityFound';
import { computeVisibleTiles } from '@/engine/systems/visibility';
import {
  LENS_STORAGE_KEY,
  LENS_SWATCH,
  classifyBordersTile,
  classifySettleTile,
  classifyYieldBand,
  clearLens,
  computeLensBuckets,
  lensLegend,
  lensSignal,
  parseLensValue,
  setLens,
  suggestLensForUnitType,
  toggleLens,
} from '@/ui/hud/LensBar';

/**
 * Lens tile-classification helpers (docs/UI_REWORK.md P2.1): pure logic over
 * tile data — the renderer only paints the buckets these functions produce.
 */

const OPTIONS = {
  seed: 424242,
  preset: 'pangaea' as const,
  sizeId: 'duel',
  humanCivId: 'rome',
  aiCivIds: ['egypt'],
  difficulty: 1,
};

function installMemoryStorage(): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as unknown as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
  return store;
}

function dropStorage(): void {
  delete (globalThis as unknown as Record<string, unknown>).localStorage;
}

beforeEach(() => {
  dropStorage();
  clearLens();
});

afterEach(() => {
  dropStorage();
  clearLens();
});

describe('parseLensValue', () => {
  it('accepts the three known ids', () => {
    expect(parseLensValue('yields')).toBe('yields');
    expect(parseLensValue('settle')).toBe('settle');
    expect(parseLensValue('borders')).toBe('borders');
  });

  it('resolves anything else (incl. stale/empty values) to no lens', () => {
    expect(parseLensValue(null)).toBeNull();
    expect(parseLensValue(undefined)).toBeNull();
    expect(parseLensValue('')).toBeNull();
    expect(parseLensValue('yelds')).toBeNull();
    expect(parseLensValue(42)).toBeNull();
  });
});

describe('classifyYieldBand', () => {
  it('bands totals at 2 and 4', () => {
    expect(classifyYieldBand(0)).toBe('poor');
    expect(classifyYieldBand(1)).toBe('poor');
    expect(classifyYieldBand(2)).toBe('fair');
    expect(classifyYieldBand(3)).toBe('fair');
    expect(classifyYieldBand(4)).toBe('rich');
    expect(classifyYieldBand(12)).toBe('rich');
  });
});

describe('classifySettleTile', () => {
  it('blocks water and mountains regardless of distance', () => {
    expect(classifySettleTile({ terrain: 'ocean', elevation: 'flat' }, 99)).toBe('blocked');
    expect(classifySettleTile({ terrain: 'coast', elevation: 'flat' }, 99)).toBe('blocked');
    expect(classifySettleTile({ terrain: 'grassland', elevation: 'mountain' }, 99)).toBe('blocked');
  });

  it('flags land within 3 of a city, allows ring 3+', () => {
    const land = { terrain: 'plains', elevation: 'flat' };
    expect(classifySettleTile(land, 0)).toBe('too-close');
    expect(classifySettleTile(land, 2)).toBe('too-close');
    expect(classifySettleTile(land, 3)).toBe('ok');
    expect(classifySettleTile({ terrain: 'desert', elevation: 'hills' }, 10)).toBe('ok');
  });
});

describe('classifyBordersTile', () => {
  it('splits mine / foreign / unowned', () => {
    expect(classifyBordersTile(undefined, 0)).toBe('unowned');
    expect(classifyBordersTile(0, 0)).toBe('mine');
    expect(classifyBordersTile(1, 0)).toBe('foreign');
  });
});

describe('lensLegend', () => {
  it('every lens documents each painted class with a swatch + label', () => {
    expect(lensLegend('yields')).toHaveLength(3);
    expect(lensLegend('settle')).toHaveLength(2);
    expect(lensLegend('borders')).toHaveLength(2);
    for (const lens of ['yields', 'settle', 'borders'] as const) {
      for (const entry of lensLegend(lens)) {
        expect(entry.color).toMatch(/^#[0-9a-f]{6}$/);
        expect(entry.label.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('lens signal + persistence', () => {
  it('one active at a time; clicking the active lens clears it', () => {
    toggleLens('yields');
    expect(lensSignal.value).toBe('yields');
    toggleLens('settle');
    expect(lensSignal.value).toBe('settle');
    toggleLens('settle');
    expect(lensSignal.value).toBeNull();
    setLens('borders');
    expect(lensSignal.value).toBe('borders');
    clearLens();
    expect(lensSignal.value).toBeNull();
  });

  it('persists the active lens in localStorage, removes on clear', () => {
    const store = installMemoryStorage();
    setLens('yields');
    expect(store.get(LENS_STORAGE_KEY)).toBe('yields');
    expect(parseLensValue(store.get(LENS_STORAGE_KEY))).toBe('yields');
    clearLens();
    expect(store.has(LENS_STORAGE_KEY)).toBe(false);
  });
});

describe('suggestLensForUnitType', () => {
  it('settler selection fills a vacancy but never yanks an explicit lens', () => {
    suggestLensForUnitType('settler');
    expect(lensSignal.value).toBe('settle');
    setLens('yields');
    suggestLensForUnitType('settler');
    expect(lensSignal.value).toBe('yields');
  });

  it('non-settlers and empty selection suggest nothing', () => {
    suggestLensForUnitType('warrior');
    expect(lensSignal.value).toBeNull();
    suggestLensForUnitType(null);
    suggestLensForUnitType(undefined);
    expect(lensSignal.value).toBeNull();
  });
});

describe('computeLensBuckets', () => {
  it('yields buckets partition exactly the explored tiles', () => {
    const state = generateGame(OPTIONS);
    const humanId = state.players.find((p) => p.isHuman)!.id;
    const explored = new Set(state.players[humanId].exploredTileIds);
    expect(explored.size).toBeGreaterThan(0);
    expect(explored.size).toBeLessThan(state.map.tiles.length);
    const buckets = computeLensBuckets(state, 'yields', {
      humanId,
      explored,
      visible: computeVisibleTiles(state, humanId),
    });
    expect(buckets).toHaveLength(3);
    expect(buckets[0].color).toBe(LENS_SWATCH.yieldsRich);
    const all = buckets.flatMap((b) => b.tileIds);
    expect(new Set(all)).toEqual(explored);
    expect(all.length).toBe(explored.size); // disjoint: no tile painted twice
  });

  it('settle ok-tiles always satisfy canFoundCityAt; founding marks neighbors too-close', () => {
    const state = generateGame(OPTIONS);
    const humanId = state.players.find((p) => p.isHuman)!.id;
    const scopeOf = () => ({
      humanId,
      explored: new Set(state.players[humanId].exploredTileIds),
      visible: computeVisibleTiles(state, humanId),
    });
    // Boot: no cities yet, so nothing is too close and every ok tile is legal.
    let buckets = computeLensBuckets(state, 'settle', scopeOf());
    expect(buckets[1].tileIds).toEqual([]);
    for (const id of buckets[0].tileIds) expect(canFoundCityAt(state, id)).toBe(true);

    const settler = Object.values(state.units).find(
      (u) => u.ownerId === humanId && u.typeId === 'settler',
    )!;
    dispatch(state, { type: 'foundCity', unitId: settler.id });
    buckets = computeLensBuckets(state, 'settle', scopeOf());
    expect(buckets[0].tileIds.length).toBeGreaterThan(0);
    expect(buckets[1].tileIds.length).toBeGreaterThan(0);
    for (const id of buckets[0].tileIds) expect(canFoundCityAt(state, id)).toBe(true);
    for (const id of buckets[1].tileIds) {
      const t = state.map.tiles[id];
      expect(['ocean', 'coast']).not.toContain(t.terrain);
      expect(t.elevation).not.toBe('mountain');
      expect(canFoundCityAt(state, id)).toBe(false);
    }
  });

  it('borders buckets hold own explored land only (no foreign leaks at boot)', () => {
    const state = generateGame(OPTIONS);
    const humanId = state.players.find((p) => p.isHuman)!.id;
    const scopeOf = () => ({
      humanId,
      explored: new Set(state.players[humanId].exploredTileIds),
      visible: computeVisibleTiles(state, humanId),
    });
    let buckets = computeLensBuckets(state, 'borders', scopeOf());
    expect(buckets[0].tileIds).toEqual([]);
    expect(buckets[1].tileIds).toEqual([]);

    const settler = Object.values(state.units).find(
      (u) => u.ownerId === humanId && u.typeId === 'settler',
    )!;
    dispatch(state, { type: 'foundCity', unitId: settler.id });
    buckets = computeLensBuckets(state, 'borders', scopeOf());
    expect(buckets[0].tileIds.length).toBeGreaterThan(0);
    for (const id of buckets[0].tileIds) {
      expect(state.map.tiles[id].ownerPlayerId).toBe(humanId);
    }
    for (const id of buckets[1].tileIds) {
      const owner = state.map.tiles[id].ownerPlayerId;
      expect(owner).not.toBe(humanId);
      expect(owner).not.toBeUndefined();
    }
    const overlap = buckets[0].tileIds.filter((id) => buckets[1].tileIds.includes(id));
    expect(overlap).toEqual([]);
  });
});
