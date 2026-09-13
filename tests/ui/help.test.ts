import { describe, expect, it } from 'vitest';
import { buildHelpIndex, getHelpEntry, searchHelp } from '@/ui/help';

/**
 * P2.4 Help search index (docs/UI_REWORK.md): reference entries generated
 * from the content defs plus hand-written concepts. Pure functions only —
 * signal wiring (openHelp/closeHelp) and the overlay component are covered
 * by the integrator's e2e spec (see the wiring notes in `src/ui/help.ts`).
 */

const index = buildHelpIndex();

describe('help index catalog', () => {
  it('covers every group', () => {
    const cats = new Set(index.map((e) => e.category));
    for (const c of ['unit', 'building', 'tech', 'yield', 'resource', 'civ', 'terrain', 'feature', 'concept'] as const) {
      expect(cats.has(c)).toBe(true);
    }
    expect(index.length).toBeGreaterThan(100);
  });

  it('every required concept entry exists', () => {
    for (const id of [
      'concept-zoc',
      'concept-1upt',
      'concept-diplomacy',
      'concept-barbarians',
      'concept-combat',
      'concept-healing',
      'concept-city-growth',
      'concept-production',
    ]) {
      expect(getHelpEntry(id, index), id).toBeDefined();
    }
  });

  it('every TileTooltip Tier-3 anchor resolves', () => {
    for (const id of [
      'terrain-grassland',
      'terrain-ocean',
      'feature-forest',
      'resource-wheat',
      'yield-food',
      'yield-production',
      'yield-gold',
      'yield-science',
      'yield-culture',
      'concept-zoc',
      'concept-1upt',
      'concept-city-growth',
      'civ-rome',
    ]) {
      expect(getHelpEntry(id, index), id).toBeDefined();
    }
  });

  it('returns undefined for unknown ids', () => {
    expect(getHelpEntry('concept-nope', index)).toBeUndefined();
    expect(getHelpEntry('unit-nope', index)).toBeUndefined();
  });
});

describe('searchHelp', () => {
  it('finds units by partial name', () => {
    const ids = searchHelp('warr', index).map((e) => e.id);
    expect(ids).toContain('unit-warrior');
  });

  it('finds buildings by partial name', () => {
    const ids = searchHelp('grana', index).map((e) => e.id);
    expect(ids).toContain('building-granary');
  });

  it('finds techs by partial name', () => {
    const ids = searchHelp('potter', index).map((e) => e.id);
    expect(ids).toContain('tech-pottery');
  });

  it('finds resources, civs and yields by partial name', () => {
    expect(searchHelp('silk', index).map((e) => e.id)).toContain('resource-silk');
    expect(searchHelp('rome', index).map((e) => e.id)).toContain('civ-rome');
    expect(searchHelp('beaker', index).map((e) => e.id)).toContain('yield-science');
  });

  it('finds concepts by name, alias or mechanic word', () => {
    expect(searchHelp('zone of control', index)[0]?.id).toBe('concept-zoc');
    expect(searchHelp('1upt', index).map((e) => e.id)).toContain('concept-1upt');
    expect(searchHelp('drift', index).map((e) => e.id)).toContain('concept-diplomacy');
    expect(searchHelp('barbarian', index).map((e) => e.id)).toContain('concept-barbarians');
    expect(searchHelp('healing', index).map((e) => e.id)).toContain('concept-healing');
  });

  it('is case-insensitive', () => {
    expect(searchHelp('WARRIOR', index).map((e) => e.id)).toContain('unit-warrior');
    expect(searchHelp('Zone Of Control', index)[0]?.id).toBe('concept-zoc');
  });

  it('ANDs multiple tokens', () => {
    const ids = searchHelp('bronze working', index).map((e) => e.id);
    expect(ids).toContain('tech-bronze_working');
    for (const e of searchHelp('bronze working', index)) {
      const hay = `${e.title} ${e.keywords} ${e.body}`.toLowerCase();
      expect(hay).toContain('bronze');
      expect(hay).toContain('working');
    }
  });

  it('empty query returns the whole index in browse order', () => {
    expect(searchHelp('', index)).toEqual(index);
    expect(searchHelp('   ', index)).toEqual(index);
  });

  it('returns an empty list when nothing matches', () => {
    expect(searchHelp('zzz-no-such-thing', index)).toEqual([]);
  });
});
