import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildingArt,
  civArt,
  keyOf,
  resourceArt,
  unitArt,
  yieldArt,
} from '@/assets/art';
import { UNITS } from '@/content/units';
import { BUILDINGS } from '@/content/buildings';
import { RESOURCES } from '@/content/resources';
import { CIVS } from '@/content/civs';

/**
 * Art backstop (docs/ART_STYLE.md "Gilded Hex Seals"): every content id must
 * resolve through the registry (catches keyOf/filename drift like the 2026-09
 * underscore bug that silently dropped 7 seals), and every registered seal
 * must carry the canonical frame, the milled ring, ink contour, gold touch
 * and an accessible title.
 */

const ART_ROOT = join(process.cwd(), 'src', 'assets', 'art');

function diskFiles(group: string): string[] {
  return readdirSync(join(ART_ROOT, group))
    .filter((f) => f.endsWith('.svg'))
    .map((f) => f.replace(/\.svg$/, ''));
}

describe('art registry', () => {
  it('keyOf handles hyphens, underscores and digits', () => {
    expect(keyOf('./units/chu_ko_nu.svg')).toBe('units/chu_ko_nu');
    expect(keyOf('./units/war_chariot.svg')).toBe('units/war_chariot');
    expect(keyOf('./buildings/great_library.svg')).toBe('buildings/great_library');
    expect(keyOf('./buildings/notre_dame.svg')).toBe('buildings/notre_dame');
    expect(keyOf('./ui/barbarian-camp.svg')).toBe('ui/barbarian-camp');
    expect(keyOf('./yields/gold.svg')).toBe('yields/gold');
  });

  it('every unit id resolves to a seal', () => {
    const missing = UNITS.map((u) => u.id).filter((id) => unitArt(id) === undefined);
    expect(missing).toEqual([]);
  });

  it('every building/wonder id resolves to a seal', () => {
    const missing = BUILDINGS.map((b) => b.id).filter((id) => buildingArt(id) === undefined);
    expect(missing).toEqual([]);
  });

  it('every resource id resolves to a seal', () => {
    const missing = RESOURCES.map((r) => r.id).filter((id) => resourceArt(id) === undefined);
    expect(missing).toEqual([]);
  });

  it('every playable civ + barbarians resolve to a seal', () => {
    const missing = CIVS.map((c) => c.id).filter((id) => civArt(id) === undefined);
    expect(missing).toEqual([]);
  });

  it('every yield glyph resolves', () => {
    for (const id of ['food', 'production', 'gold', 'science', 'culture']) {
      expect(yieldArt(id), `yields/${id}`).toBeDefined();
    }
  });

  it('no orphan files: every disk seal is reachable via keyOf', () => {
    for (const group of ['units', 'yields', 'resources', 'civs', 'buildings', 'ui']) {
      for (const id of diskFiles(group)) {
        expect(keyOf(`./${group}/${id}.svg`), `${group}/${id}`).toBe(`${group}/${id}`);
      }
    }
  });
});

describe('gilded hex seal pillars', () => {
  const cases: Array<{ group: string; id: string; src: string }> = [];
  for (const group of ['units', 'yields', 'resources', 'civs', 'buildings', 'ui']) {
    for (const id of diskFiles(group)) {
      cases.push({ group, id, src: readFileSync(join(ART_ROOT, group, `${id}.svg`), 'utf8') });
    }
  }

  it(`all ${cases.length} seals carry the canonical frame + milled ring + title`, () => {
    const bad: string[] = [];
    for (const { group, id, src } of cases) {
      const low = src.toLowerCase();
      if (!src.includes('32,2 58,17 58,47 32,62 6,47 6,17')) bad.push(`${group}/${id}: outer hex`);
      if (!low.includes('dasharray')) bad.push(`${group}/${id}: milled ring`);
      if (!src.includes('<title>')) bad.push(`${group}/${id}: <title>`);
      if (!src.includes('role=')) bad.push(`${group}/${id}: role`);
      if (!low.includes('viewbox')) bad.push(`${group}/${id}: viewBox`);
      if (!low.includes('#1d1a14')) bad.push(`${group}/${id}: plate fill`);
      if (!low.includes('#12100d')) bad.push(`${group}/${id}: ink contour`);
      if (!low.includes('#c8a24a')) bad.push(`${group}/${id}: gold touch`);
      if (low.includes('<lineargradient') || low.includes('<radialgradient')) {
        bad.push(`${group}/${id}: gradient`);
      }
      if (low.includes('<filter') || low.includes('drop-shadow') || low.includes('fedropshadow')) {
        bad.push(`${group}/${id}: filter`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('civ seals carry no ground shadow (badges, not grounded objects)', () => {
    const bad: string[] = [];
    for (const id of diskFiles('civs')) {
      const src = readFileSync(join(ART_ROOT, 'civs', `${id}.svg`), 'utf8');
      if (/<ellipse[^>]*opacity/.test(src)) bad.push(`civs/${id}`);
    }
    expect(bad).toEqual([]);
  });
});
