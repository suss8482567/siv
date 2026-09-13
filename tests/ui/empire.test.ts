import { describe, expect, it } from 'vitest';
import { buildContentDb } from '@/content';
import { dispatch, generateGame } from '@/engine';
import {
  buildEmpireCityRows,
  buildEmpireUnitRows,
  cityGrowthStatus,
  productionTurnsLeft,
  unitOrdersLabel,
} from '@/ui/screens/EmpireOverview';

/**
 * P2.2 empire overview helpers (docs/UI_REWORK.md):
 * pure row-building / sorting / formatting logic over fixture states.
 * No rendering, no commands — the component is read-only.
 */

const OPTIONS = {
  seed: 424242,
  preset: 'pangaea' as const,
  sizeId: 'duel',
  humanCivId: 'rome',
  aiCivIds: ['egypt'],
  difficulty: 1,
};

function humanIdOf(state: ReturnType<typeof generateGame>): number {
  return state.players.find((p) => p.isHuman)!.id;
}

function foundedWithProduction(state: ReturnType<typeof generateGame>) {
  const humanId = humanIdOf(state);
  const settler = Object.values(state.units).find(
    (u) => u.ownerId === humanId && u.typeId === 'settler',
  )!;
  dispatch(state, { type: 'foundCity', unitId: settler.id });
  const city = Object.values(state.cities).find((c) => c.ownerId === humanId)!;
  dispatch(state, { type: 'setProduction', cityId: city.id, item: { kind: 'unit', id: 'warrior' } });
  dispatch(state, { type: 'setResearch', techId: 'pottery' });
  return { humanId, city };
}

describe('productionTurnsLeft', () => {
  it('is a dash when nothing is produced', () => {
    expect(productionTurnsLeft(40, 0, 0)).toBe('—');
  });
  it('rounds up and floors at one turn', () => {
    expect(productionTurnsLeft(40, 0, 4)).toBe('10 turns');
    expect(productionTurnsLeft(40, 39, 4)).toBe('1 turns');
  });
});

describe('cityGrowthStatus', () => {
  it('stalls at zero food', () => {
    expect(cityGrowthStatus(0, 0, 1)).toEqual({ label: 'Stalled', stalled: true });
  });
  it('counts down to growth otherwise', () => {
    const g = cityGrowthStatus(4, 0, 1);
    expect(g.stalled).toBe(false);
    expect(g.label.startsWith('Growing (')).toBe(true);
  });
});

describe('unitOrdersLabel', () => {
  it('maps fortified / slept / awaiting', () => {
    expect(unitOrdersLabel({ fortified: true, slept: false })).toBe('Fortified');
    expect(unitOrdersLabel({ fortified: false, slept: true })).toBe('Sleeping');
    expect(unitOrdersLabel({ fortified: false, slept: false })).toBe('Awaiting orders');
  });
});

describe('buildEmpireCityRows', () => {
  it('is empty before founding, then lists the city in id order', () => {
    const state = generateGame(OPTIONS);
    expect(buildEmpireCityRows(state)).toEqual([]);
    const { city } = foundedWithProduction(state);
    const rows = buildEmpireCityRows(state);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.id).toBe(city.id);
    expect(row.name).toBe(city.name);
    expect(row.tileId).toBe(city.tileId);
    expect(row.population).toBe(city.population);
    const ids = rows.map((r) => r.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });

  it('shows the queued build with turns-left and upkeep', () => {
    const state = generateGame(OPTIONS);
    foundedWithProduction(state);
    const [row] = buildEmpireCityRows(state);
    expect(row.buildName).toBe(buildContentDb().units['warrior']!.name);
    expect(row.emptyQueue).toBe(false);
    expect(row.buildTurns.endsWith('turns')).toBe(true);
    expect(typeof row.upkeep).toBe('number');
    expect(row.upkeep).toBeGreaterThanOrEqual(0);
  });

  it('flags an empty queue', () => {
    const state = generateGame(OPTIONS);
    const humanId = humanIdOf(state);
    const settler = Object.values(state.units).find(
      (u) => u.ownerId === humanId && u.typeId === 'settler',
    )!;
    dispatch(state, { type: 'foundCity', unitId: settler.id });
    const [row] = buildEmpireCityRows(state);
    expect(row.emptyQueue).toBe(true);
    expect(row.buildName).toBe('Empty queue');
    expect(row.buildTurns).toBe('—');
  });

  it('reports a growth label consistent with the stall flag', () => {
    const state = generateGame(OPTIONS);
    foundedWithProduction(state);
    const [row] = buildEmpireCityRows(state);
    if (row.stalled) expect(row.growth).toBe('Stalled');
    else expect(row.growth.startsWith('Growing (')).toBe(true);
  });
});

describe('buildEmpireUnitRows', () => {
  it('lists every human unit awaiting orders at boot', () => {
    const state = generateGame(OPTIONS);
    const humanId = humanIdOf(state);
    const rows = buildEmpireUnitRows(state);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBe(
      Object.values(state.units).filter((u) => u.ownerId === humanId).length,
    );
    for (const row of rows) {
      expect(row.orders).toBe('Awaiting orders');
      expect(row.hpMp).toContain('HP');
      expect(row.hpMp).toContain('MP');
    }
    const ids = rows.map((r) => r.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });

  it('reflects fortify and sleep orders', () => {
    const state = generateGame(OPTIONS);
    const humanId = humanIdOf(state);
    const units = Object.values(state.units).filter((u) => u.ownerId === humanId);
    dispatch(state, { type: 'fortify', unitId: units[0].id });
    if (units[1]) dispatch(state, { type: 'sleep', unitId: units[1].id });
    const rows = buildEmpireUnitRows(state);
    expect(rows.find((r) => r.id === units[0].id)!.orders).toBe('Fortified');
    if (units[1]) expect(rows.find((r) => r.id === units[1].id)!.orders).toBe('Sleeping');
  });
});

