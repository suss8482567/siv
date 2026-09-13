/**
 * P2.2 Empire overview (docs/UI_REWORK.md): one read-only table modal over
 * every human city (build, turns-left, upkeep, growth) and unit (orders, HP/MP).
 *
 * Read-only by design: rows never issue commands — they jump the camera via
 * `jumpToTile` and select via the existing selection signal. City rows also
 * set `selectionSignal.cityId`, which opens CityScreen by itself. The modal
 * closes first so modals never stack (dismiss-to-inspect-map).
 *
 * No key listeners here — Esc is owned by GameShell's global chain (the
 * integrator inserts `empireOpen` there; wiring snippet at the bottom).
 */
import { signal } from '@preact/signals';
import { buildContentDb } from '@/content';
import type { GameState, Unit } from '@/engine';
import { computeCityYields, foodToGrow } from '@/engine/systems/economy';
import { unitArt } from '@/assets/art';
import { ArtIcon } from '../hud/ArtIcon';
import { jumpToTile } from '../nav';
import { selectionSignal, sessionSignal } from '../store';

/** Modal visibility. Always set via openEmpire()/closeEmpire(). */
export const empireOpen = signal(false);
export function openEmpire(): void {
  empireOpen.value = true;
}
export function closeEmpire(): void {
  empireOpen.value = false;
}

// ---------------------------------------------------------------------------
// Pure row helpers (tested in tests/ui/empire.test.ts)
// ---------------------------------------------------------------------------

export type UnitOrders = 'Awaiting orders' | 'Fortified' | 'Sleeping' | 'To rally';

/** Orders state for one unit: fortified/sleeping win, rally march next, else awaits. */
export function unitOrdersLabel(unit: Pick<Unit, 'fortified' | 'slept' | 'gotoRally'>): UnitOrders {
  if (unit.fortified) return 'Fortified';
  if (unit.slept) return 'Sleeping';
  if (unit.gotoRally) return 'To rally';
  return 'Awaiting orders';
}

/**
 * Turns to finish at the current per-turn rate (queued progress counts).
 * Mirrors CityScreen.turnsLabel / TechTree.turnsFor.
 */
export function productionTurnsLeft(cost: number, stored: number, perTurn: number): string {
  if (perTurn <= 0) return '—';
  return `${Math.max(1, Math.ceil(Math.max(0, cost - stored) / perTurn))} turns`;
}

export interface CityGrowth {
  label: string;
  stalled: boolean;
}

/** Growth vs stall at the city's current net food rate (v0: yields are net). */
export function cityGrowthStatus(foodPerTurn: number, foodStored: number, population: number): CityGrowth {
  if (foodPerTurn <= 0) return { label: 'Stalled', stalled: true };
  const need = foodToGrow(population);
  const turns = Math.max(1, Math.ceil(Math.max(0, need - Math.max(0, foodStored)) / foodPerTurn));
  return { label: `Growing (${turns}t)`, stalled: false };
}

export interface EmpireCityRow {
  id: number;
  name: string;
  tileId: number;
  population: number;
  buildName: string;
  buildTurns: string;
  /** Building maintenance in gold/turn (unit upkeep is empire-wide). */
  upkeep: number;
  growth: string;
  stalled: boolean;
  emptyQueue: boolean;
}

/** Every human city, founding order. Pure — reads state via computeCityYields. */
export function buildEmpireCityRows(state: GameState): EmpireCityRow[] {
  const humanId = state.players.find((p) => p.isHuman)?.id;
  if (humanId === undefined) return [];
  const content = buildContentDb();
  return Object.values(state.cities)
    .filter((c) => c.ownerId === humanId)
    .sort((a, b) => a.id - b.id)
    .map((city) => {
      const y = computeCityYields(state, city);
      const item = city.productionQueue[0];
      let buildName = 'Empty queue';
      let buildTurns = '—';
      if (item) {
        buildName =
          item.kind === 'unit'
            ? content.units[item.id]?.name ?? item.id
            : content.buildings[item.id]?.name ?? item.id;
        const cost =
          item.kind === 'unit' ? content.units[item.id]?.cost : content.buildings[item.id]?.cost;
        if (cost !== undefined) buildTurns = productionTurnsLeft(cost, city.productionStored, y.production);
      }
      let upkeep = 0;
      for (const bid of city.buildings) upkeep += content.buildings[bid]?.maintenance ?? 0;
      const growth = cityGrowthStatus(y.food, city.foodStored, city.population);
      return {
        id: city.id,
        name: city.name,
        tileId: city.tileId,
        population: city.population,
        buildName,
        buildTurns,
        upkeep,
        growth: growth.label,
        stalled: growth.stalled,
        emptyQueue: !item,
      };
    });
}

export interface EmpireUnitRow {
  id: number;
  typeId: string;
  name: string;
  tileId: number;
  orders: UnitOrders;
  hp: number;
  mpLeft: number;
  mpMax: number;
  hpMp: string;
}

/** Every human unit, id order. Pure. */
export function buildEmpireUnitRows(state: GameState): EmpireUnitRow[] {
  const humanId = state.players.find((p) => p.isHuman)?.id;
  if (humanId === undefined) return [];
  const content = buildContentDb();
  return Object.values(state.units)
    .filter((u) => u.ownerId === humanId)
    .sort((a, b) => a.id - b.id)
    .map((u) => {
      const mpMax = content.units[u.typeId]?.moves ?? 0;
      return {
        id: u.id,
        typeId: u.typeId,
        name: content.units[u.typeId]?.name ?? u.typeId,
        tileId: u.tileId,
        orders: unitOrdersLabel(u),
        hp: u.hp,
        mpLeft: u.movementLeft,
        mpMax,
        hpMp: `${u.hp} HP · ${u.movementLeft}/${mpMax} MP`,
      };
    });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EmpireOverview() {
  const session = sessionSignal.value;
  if (!session || !empireOpen.value || session.state.winner) return null;
  const state = session.state;
  const cityRows = buildEmpireCityRows(state);
  const unitRows = buildEmpireUnitRows(state);

  // Close first (no stacked modals); the selection below re-opens CityScreen
  // by itself for city rows.
  const jumpCity = (row: EmpireCityRow): void => {
    closeEmpire();
    selectionSignal.value = { unitId: null, cityId: row.id };
    jumpToTile(row.tileId, { unitId: null, cityId: row.id });
  };
  const jumpUnit = (row: EmpireUnitRow): void => {
    closeEmpire();
    selectionSignal.value = { unitId: row.id, cityId: null };
    jumpToTile(row.tileId, { unitId: row.id, cityId: null });
  };

  return (
    <div class="modal-backdrop" onClick={() => closeEmpire()}>
      <div
        class="modal empire-overview"
        role="dialog"
        aria-label="Empire overview"
        data-testid="empire-overview"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>Empire</h2>
          <span>
            {cityRows.length} {cityRows.length === 1 ? 'city' : 'cities'} · {unitRows.length}{' '}
            {unitRows.length === 1 ? 'unit' : 'units'}
          </span>
          <button class="btn-ghost" data-testid="empire-close" onClick={() => closeEmpire()}>
            Close
          </button>
        </header>
        <h3>Cities</h3>
        {cityRows.length === 0 ? (
          <div class="empire-empty">No cities founded yet.</div>
        ) : (
          <table class="empire-table">
            <thead>
              <tr>
                <th>City</th>
                <th>Pop</th>
                <th>Building</th>
                <th>Upkeep</th>
                <th>Growth</th>
              </tr>
            </thead>
            <tbody>
              {cityRows.map((row) => (
                <tr
                  key={row.id}
                  class="empire-row"
                  data-testid={`empire-row-city-${row.id}`}
                  title={`${row.name} — jump to city (opens city screen)`}
                  onClick={() => jumpCity(row)}
                >
                  <td class="empire-name">{row.name}</td>
                  <td>{row.population}</td>
                  <td>
                    {row.buildName} · {row.buildTurns}
                    {row.emptyQueue && <span class="chip chip-denounced">Empty queue</span>}
                  </td>
                  <td>{row.upkeep} g/t</td>
                  <td>
                    {row.growth}
                    {row.stalled && <span class="chip chip-war">Stalled</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h3>Units</h3>
        {unitRows.length === 0 ? (
          <div class="empire-empty">No units.</div>
        ) : (
          <table class="empire-table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Orders</th>
                <th>HP/MP</th>
              </tr>
            </thead>
            <tbody>
              {unitRows.map((row) => (
                <tr
                  key={row.id}
                  class="empire-row"
                  data-testid={`empire-row-unit-${row.id}`}
                  title={`${row.name} — jump to unit`}
                  onClick={() => jumpUnit(row)}
                >
                  <td>
                    <span class="empire-unit-cell">
                      <ArtIcon art={unitArt(row.typeId)} size={20} label={row.name} />
                      <span class="empire-name">{row.name}</span>
                    </span>
                  </td>
                  <td>{row.orders}</td>
                  <td class="empire-dim">{row.hpMp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/*
 * INTEGRATOR WIRING (GameShell.tsx — do NOT add key listeners here):
 *
 *   import { EmpireOverview, closeEmpire, empireOpen } from './EmpireOverview';
 *
 *   // 1. Mount next to the other modals in the GameShell JSX:
 *   <CityScreen />
 *   <EmpireOverview />       // <-- add here
 *   <TechTree />
 *
 *   // 2. Esc chain — insert in handleEscapeKey() after Diplomacy, before
 *   //    the selection clear (overview dismisses-to-inspect-map):
 *   if (diplomacyOpen.value) { closeDiplomacy(); return; }
 *   if (empireOpen.value) {  // <-- add here
 *     closeEmpire();
 *     return;
 *   }
 */
