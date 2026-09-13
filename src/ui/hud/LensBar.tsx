/**
 * Map lenses, row above the minimap (docs/UI_REWORK.md P2.1): Yields / Settle /
 * Borders — one active at a time, click toggles, right-click clears. Settler
 * selection auto-suggests the Settle lens via suggestLensForUnitType (wired by
 * GameShell, not here). UI-only state persisted in localStorage; overlay
 * painting is delegated to MapRenderer.setLensOverlay with buckets computed
 * once per activation — never per frame.
 */
import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import type { GameState } from '@/engine';
import { hexDistance } from '@/engine/hex/axial';
import { canFoundCityAt } from '@/engine/systems/cityFound';
import { tileYields } from '@/engine/systems/economy';
import { computeVisibleTiles } from '@/engine/systems/visibility';
import type { LensBucket } from '@/render/MapRenderer';
import { sessionSignal } from '../store';

export type LensKind = 'yields' | 'settle' | 'borders';
export type ActiveLens = LensKind | null;

export const LENS_STORAGE_KEY = 'siv.lens';

/**
 * Lens swatch colors (parchment/gold chrome; alpha bands differ per class so
 * color is never the sole channel — rubric §8 items 5–6).
 */
export const LENS_SWATCH = {
  yieldsRich: '#7fbf6a',
  yieldsFair: '#c8a24a',
  yieldsPoor: '#5a5344',
  /** Bright leaf-green: must read on grassland at a glance (rubric §8 item 1). */
  settleOk: '#9fd66b',
  settleNear: '#e08a52',
  borderMine: '#c8a24a',
  borderForeign: '#3f7fae',
} as const;

export interface LensLegendEntry {
  color: string;
  label: string;
}

/** Small legend chip data for the active lens (rendered inside the lens bar). */
export function lensLegend(lens: LensKind): LensLegendEntry[] {
  switch (lens) {
    case 'yields':
      return [
        { color: LENS_SWATCH.yieldsRich, label: 'Rich (4+ yield)' },
        { color: LENS_SWATCH.yieldsFair, label: 'Fair (2-3 yield)' },
        { color: LENS_SWATCH.yieldsPoor, label: 'Poor (0-1 yield)' },
      ];
    case 'settle':
      return [
        { color: LENS_SWATCH.settleOk, label: 'Can found city' },
        { color: LENS_SWATCH.settleNear, label: 'Too close to a city' },
      ];
    case 'borders':
      return [
        { color: LENS_SWATCH.borderMine, label: 'Your territory' },
        { color: LENS_SWATCH.borderForeign, label: 'Foreign territory' },
      ];
  }
}

/** Total-yield bands for the Yields lens (food+prod+gold+science+culture). */
export type YieldBand = 'rich' | 'fair' | 'poor';
export function classifyYieldBand(total: number): YieldBand {
  if (total >= 4) return 'rich';
  if (total >= 2) return 'fair';
  return 'poor';
}

export type SettleClass = 'ok' | 'too-close' | 'blocked';
/**
 * Reason a tile can(not) found a city. Mirrors canFoundCityAt (SPEC: land,
 * not mountain, >=3 tiles from any city); water/mountain stay unpainted so
 * only genuinely contestable "too close" land gets the warning tint.
 */
export function classifySettleTile(
  tile: { terrain: string; elevation: string },
  minCityDistance: number,
): SettleClass {
  if (tile.terrain === 'ocean' || tile.terrain === 'coast' || tile.elevation === 'mountain') {
    return 'blocked';
  }
  if (minCityDistance < 3) return 'too-close';
  return 'ok';
}

export type BordersClass = 'mine' | 'foreign' | 'unowned';
export function classifyBordersTile(
  ownerPlayerId: number | undefined,
  humanId: number,
): BordersClass {
  if (ownerPlayerId === undefined) return 'unowned';
  return ownerPlayerId === humanId ? 'mine' : 'foreign';
}

/** Lenient parse: anything but the three known ids resolves to no lens. */
export function parseLensValue(raw: unknown): ActiveLens {
  return raw === 'yields' || raw === 'settle' || raw === 'borders' ? raw : null;
}

function readStoredLens(): ActiveLens {
  try {
    if (typeof localStorage === 'undefined') return null;
    return parseLensValue(localStorage.getItem(LENS_STORAGE_KEY));
  } catch {
    return null;
  }
}

function storeLens(value: ActiveLens): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === null) localStorage.removeItem(LENS_STORAGE_KEY);
    else localStorage.setItem(LENS_STORAGE_KEY, value);
  } catch {
    // Private-mode writes fail silently; the in-memory signal still holds.
  }
}

/** Active lens signal (UI-only, localStorage-persisted). */
export const lensSignal = signal<ActiveLens>(readStoredLens());

export function setLens(next: ActiveLens): void {
  lensSignal.value = next;
  storeLens(next);
}

/** One active at a time: clicking the active lens clears it. */
export function toggleLens(clicked: LensKind): void {
  setLens(lensSignal.value === clicked ? null : clicked);
}

export function clearLens(): void {
  setLens(null);
}

/**
 * Settler selection auto-suggests the Settle lens. Only fills a vacancy —
 * never yanks an explicitly chosen lens. GameShell calls this from a
 * selection-change effect (see mount snippet in the return notes).
 */
export function suggestLensForUnitType(unitTypeId: string | null | undefined): void {
  if (unitTypeId === 'settler' && lensSignal.value === null) setLens('settle');
}

export interface LensScope {
  humanId: number;
  explored: Set<number> | readonly number[];
  visible: Set<number> | readonly number[];
}

function scopeHas(scope: Set<number> | readonly number[], id: number): boolean {
  return scope instanceof Set ? scope.has(id) : scope.includes(id);
}

/**
 * Precompute overlay buckets for an active lens — call once per activation /
 * state change, never per frame. Yields bands use the sim's tileYields;
 * Settle verdicts use the sim's canFoundCityAt, so the lens can never drift
 * from the rules. Fog courtesy: yields/settle paint explored tiles only;
 * borders paints own explored tiles + foreign visible tiles.
 */
export function computeLensBuckets(
  state: GameState,
  lens: LensKind,
  scope: LensScope,
): LensBucket[] {
  const { humanId, explored, visible } = scope;
  if (lens === 'yields') {
    const rich: number[] = [];
    const fair: number[] = [];
    const poor: number[] = [];
    for (const tile of state.map.tiles) {
      if (!scopeHas(explored, tile.id)) continue;
      const y = tileYields(state, tile.id);
      const total = y.food + y.production + y.gold + y.science + y.culture;
      const band = classifyYieldBand(total);
      if (band === 'rich') rich.push(tile.id);
      else if (band === 'fair') fair.push(tile.id);
      else poor.push(tile.id);
    }
    return [
      { tileIds: rich, color: LENS_SWATCH.yieldsRich, alpha: 0.28 },
      { tileIds: fair, color: LENS_SWATCH.yieldsFair, alpha: 0.2 },
      { tileIds: poor, color: LENS_SWATCH.yieldsPoor, alpha: 0.16 },
    ];
  }
  if (lens === 'settle') {
    const ok: number[] = [];
    const near: number[] = [];
    const cities = Object.values(state.cities);
    for (const tile of state.map.tiles) {
      if (!scopeHas(explored, tile.id)) continue;
      if (!canFoundCityAt(state, tile.id)) {
        if (tile.terrain !== 'ocean' && tile.terrain !== 'coast' && tile.elevation !== 'mountain') {
          let d = Infinity;
          for (const c of cities) {
            const ct = state.map.tiles[c.tileId];
            d = Math.min(d, hexDistance(tile.q, tile.r, ct.q, ct.r));
          }
          if (d < 3) near.push(tile.id);
        }
        continue;
      }
      ok.push(tile.id);
    }
    return [
      { tileIds: ok, color: LENS_SWATCH.settleOk, alpha: 0.38 },
      { tileIds: near, color: LENS_SWATCH.settleNear, alpha: 0.22 },
    ];
  }
  const mine: number[] = [];
  const foreign: number[] = [];
  for (const tile of state.map.tiles) {
    if (tile.ownerPlayerId === undefined) continue;
    if (tile.ownerPlayerId === humanId) {
      if (scopeHas(explored, tile.id)) mine.push(tile.id);
    } else if (scopeHas(visible, tile.id)) {
      foreign.push(tile.id);
    }
  }
  return [
    { tileIds: mine, color: LENS_SWATCH.borderMine, alpha: 0.22 },
    { tileIds: foreign, color: LENS_SWATCH.borderForeign, alpha: 0.24 },
  ];
}

const LENS_DEFS: { id: LensKind; label: string; testid: string; title: string }[] = [
  {
    id: 'yields',
    label: 'Yields',
    testid: 'lens-yields',
    title: 'Yields lens — tile richness (click again, or right-click, to clear)',
  },
  {
    id: 'settle',
    label: 'Settle',
    testid: 'lens-settle',
    title: 'Settle lens — where a city can found (click again, or right-click, to clear)',
  },
  {
    id: 'borders',
    label: 'Borders',
    testid: 'lens-borders',
    title: 'Borders lens — your vs foreign territory (click again, or right-click, to clear)',
  },
];

export function LensBar() {
  const lens = lensSignal.value;
  const session = sessionSignal.value;
  // Repaint on activation, clear, and state changes — never per frame.
  useEffect(() => {
    const s = sessionSignal.peek();
    if (!s?.renderer) return;
    const active = lensSignal.peek();
    if (active === null) {
      s.renderer.setLensOverlay(null);
      return;
    }
    const humanId = s.state.players.find((p) => p.isHuman)?.id ?? 0;
    const buckets = computeLensBuckets(s.state, active, {
      humanId,
      explored: new Set(s.state.players[humanId].exploredTileIds),
      visible: computeVisibleTiles(s.state, humanId),
    });
    s.renderer.setLensOverlay(buckets);
    return () => {
      sessionSignal.peek()?.renderer?.setLensOverlay(null);
    };
  }, [lens, session?.version]);
  if (!session) return null;
  return (
    <div
      class="lens-bar"
      data-testid="lens-bar"
      title="Map lenses — right-click clears"
      onContextMenu={(e) => {
        e.preventDefault();
        clearLens();
      }}
    >
      {LENS_DEFS.map((d) => (
        <button
          key={d.id}
          class={`lens-btn${lens === d.id ? ' active' : ''}`}
          data-testid={d.testid}
          aria-pressed={lens === d.id}
          title={d.title}
          onClick={() => toggleLens(d.id)}
        >
          {d.label}
        </button>
      ))}
      <button
        class="lens-btn lens-clear"
        data-testid="lens-clear"
        title="Clear the active lens"
        disabled={lens === null}
        onClick={() => clearLens()}
      >
        Clear
      </button>
      {lens !== null && (
        <span class="lens-legend">
          {lensLegend(lens).map((e) => (
            <span class="lens-chip" key={e.label}>
              <span class="lens-swatch" style={{ background: e.color }} aria-hidden="true" />
              {e.label}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
