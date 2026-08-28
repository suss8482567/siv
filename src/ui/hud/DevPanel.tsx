/**
 * Dev/cheat panel (toggle: ` or the wrench button): reveal/fog the map,
 * spawn any unit or a free city, grant gold/science/techs/buildings, finish
 * production instantly, refresh units, set flat per-turn income and smite
 * barbarians. Every action flows through submitCommand so the simulation
 * stays deterministic and replayable.
 */
import { useEffect, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { buildContentDb } from '@/content';
import { currentPlayer } from '@/engine';
import type { DevIncome } from '@/engine';
import { canFoundCityAt } from '@/engine/systems/cityFound';
import { deleteSave } from '@/save/persistence';
import { pushNotification, selectionSignal, sessionSignal, submitCommand } from '../store';
import type { Notification } from '../store';

export const devPanelOpen = signal(false);

interface IncomeRow {
  key: keyof DevIncome;
  label: string;
  step: number;
}
const INCOME_ROWS: IncomeRow[] = [
  { key: 'food', label: 'Food', step: 5 },
  { key: 'production', label: 'Prod', step: 5 },
  { key: 'gold', label: 'Gold', step: 25 },
  { key: 'science', label: 'Sci', step: 25 },
  { key: 'culture', label: 'Cult', step: 5 },
];

export function DevPanel() {
  const session = sessionSignal.value;
  const sel = selectionSignal.value;
  const [unitType, setUnitType] = useState('warrior');
  const [buildingId, setBuildingId] = useState('monument');

  // ` / ~ toggles the panel unless the user is typing in a form field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '`' && e.key !== '~') return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      devPanelOpen.value = !devPanelOpen.value;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!session) return null;
  const state = session.state;
  const content = buildContentDb();
  const human = state.players.find((p) => p.isHuman);
  if (!human) return null;

  /** Tile the tools act on: selection first, then capital, then any city. */
  const targetTileId = (): number => {
    if (sel.unitId != null && state.units[sel.unitId]) return state.units[sel.unitId].tileId;
    if (sel.cityId != null && state.cities[sel.cityId]) return state.cities[sel.cityId].tileId;
    const capital =
      Object.values(state.cities).find((c) => c.ownerId === human.id && c.buildings.includes('palace')) ??
      Object.values(state.cities).find((c) => c.ownerId === human.id);
    return capital?.tileId ?? -1;
  };
  const tileId = targetTileId();
  const tile = state.map.tiles[tileId];

  const selectedCity = (() => {
    if (sel.cityId != null && state.cities[sel.cityId] && state.cities[sel.cityId].ownerId === human.id) {
      return state.cities[sel.cityId];
    }
    if (sel.unitId != null && state.units[sel.unitId]) {
      const t = state.map.tiles[state.units[sel.unitId].tileId];
      if (t?.cityId != null) {
        const c = state.cities[t.cityId];
        if (c && c.ownerId === human.id) return c;
      }
    }
    return null;
  })();

  const run = (label: string, cmd: Parameters<typeof submitCommand>[0], kind: Notification['kind'] = 'info') => {
    submitCommand(cmd);
    pushNotification(`Dev: ${label}`, kind);
  };

  const income = human.devIncome ?? {};
  const bumpIncome = (row: IncomeRow, dir: 1 | -1) => {
    const next = Math.max(0, (income[row.key] ?? 0) + dir * row.step);
    run(
      `${row.label} +${next}/turn`,
      { type: 'devSetIncome', income: { ...income, [row.key]: next } },
      'info',
    );
  };

  const barbarianUnits = Object.values(state.units).filter(
    (u) => state.players[u.ownerId]?.civId === 'barbarians',
  ).length;

  const header = (text: string) => <h3>{text}</h3>;

  return (
    <>
      <button
        class="btn-ghost dev-toggle"
        data-testid="dev-toggle"
        title="Toggle dev tools (`)"
        onClick={() => (devPanelOpen.value = !devPanelOpen.value)}
      >
        🛠 Dev
      </button>
      {!devPanelOpen.value ? null : (
        <div class="dev-panel" data-testid="dev-panel">
          {header('Map & Spawn')}
          <div class="dev-row">
            <button class="btn-ghost" data-testid="dev-reveal-all" onClick={() => run('map revealed', { type: 'devRevealMap', revealed: true }, 'info')}>
              Reveal All
            </button>
            <button class="btn-ghost" onClick={() => run('map re-fogged', { type: 'devRevealMap', revealed: false }, 'info')}>
              Re-fog
            </button>
          </div>
          <div class="dev-row">
            <select
              class="dev-select"
              data-testid="dev-unit-type"
              value={unitType}
              onChange={(e) => setUnitType((e.target as HTMLSelectElement).value)}
            >
              {Object.values(content.units)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({Math.round(u.strength || u.rangedStrength)}⚔ {u.moves}↻)
                  </option>
                ))}
            </select>
            <button
              class="btn-primary"
              data-testid="dev-spawn-unit"
              disabled={!tile}
              onClick={() =>
                run(`${content.units[unitType]?.name ?? unitType} spawned`, {
                  type: 'devSpawnUnit',
                  typeId: unitType,
                  tileId,
                })
              }
            >
              Spawn Unit
            </button>
          </div>
          <small class="dev-hint">
            Target: {tile ? `tile ${tile.q},${tile.r}` : 'none'} ·{' '}
            <button
              class="dev-inline-btn"
              data-testid="dev-spawn-city"
              disabled={!tile || !canFoundCityAt(state, tileId)}
              onClick={() => run('city founded', { type: 'devSpawnCity', tileId })}
            >
              found city here
            </button>
          </small>

          {header('Empire')}
          <div class="dev-row">
            <button class="btn-ghost" data-testid="dev-gold-100" onClick={() => run('+100 gold', { type: 'devAddGold', amount: 100 }, 'info')}>
              +100g
            </button>
            <button class="btn-ghost" data-testid="dev-gold-1000" onClick={() => run('+1000 gold', { type: 'devAddGold', amount: 1000 }, 'info')}>
              +1000g
            </button>
            <button class="btn-ghost" data-testid="dev-sci-500" onClick={() => run('+500 science', { type: 'devAddScience', amount: 500 }, 'info')}>
              +500 sci
            </button>
          </div>
          <div class="dev-row">
            <button class="btn-ghost" onClick={() => run('all techs granted', { type: 'devGrantTech', techId: 'all' })}>
              Grant All Techs
            </button>
            <button class="btn-ghost" onClick={() => run('units refreshed', { type: 'devRefreshUnits' })}>
              Refresh Units
            </button>
          </div>

          {selectedCity ? (
            <>
              {header(`City — ${selectedCity.name}`)}
              <div class="dev-row">
                <button class="btn-ghost" data-testid="dev-city-pop" onClick={() => run(`${selectedCity.name} grew`, { type: 'devGrowCity', cityId: selectedCity.id })}>
                  +1 Pop
                </button>
                <button class="btn-ghost" data-testid="dev-city-culture" onClick={() => run(`${selectedCity.name} +50 culture`, { type: 'devAddCulture', cityId: selectedCity.id, amount: 50 })}>
                  +50 Culture
                </button>
                <button
                  class="btn-ghost"
                  data-testid="dev-city-finish"
                  disabled={selectedCity.productionQueue.length === 0}
                  onClick={() => run(`${selectedCity.name} build finished`, { type: 'devFinishProduction', cityId: selectedCity.id })}
                >
                  Finish Build
                </button>
              </div>
              <div class="dev-row">
                <select
                  class="dev-select"
                  data-testid="dev-building-type"
                  value={buildingId}
                  onChange={(e) => setBuildingId((e.target as HTMLSelectElement).value)}
                >
                  {Object.values(content.buildings)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .filter((b) => !selectedCity.buildings.includes(b.id))
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </select>
                <button
                  class="btn-ghost"
                  data-testid="dev-add-building"
                  onClick={() => run(`${content.buildings[buildingId]?.name ?? buildingId} added`, { type: 'devAddBuilding', cityId: selectedCity.id, buildingId })}
                >
                  Add Building
                </button>
              </div>
            </>
          ) : (
            <small class="dev-hint">Select one of your cities for city tools.</small>
          )}

          {header('Income / Turn')}
          <div class="dev-income-grid">
            {INCOME_ROWS.map((row) => (
              <div class="dev-stepper" key={row.key}>
                <span>{row.label}</span>
                <span class="dev-stepper-controls">
                  <button class="dev-inline-btn" data-testid={`dev-income-${row.key}-minus`} onClick={() => bumpIncome(row, -1)}>
                    −
                  </button>
                  <span class="val">{income[row.key] ?? 0}</span>
                  <button class="dev-inline-btn" data-testid={`dev-income-${row.key}-plus`} onClick={() => bumpIncome(row, 1)}>
                    +
                  </button>
                </span>
              </div>
            ))}
          </div>

          {header('World')}
          <div class="dev-row">
            <button
              class="btn-ghost"
              data-testid="dev-smite"
              disabled={barbarianUnits === 0 && state.barbarianCamps.length === 0}
              onClick={() => run('barbarians smitten', { type: 'devSmiteBarbarians' }, 'bad')}
            >
              Smite Barbarians ({barbarianUnits})
            </button>
          </div>
          {header('Maintenance')}
          <div class="dev-row">
            <button
              class="btn-ghost"
              data-testid="dev-delete-backup"
              title="Delete the audit-backup IndexedDB slot 'backup-pre-scan'"
              onClick={() => {
                void deleteSave('backup-pre-scan')
                  .then(() => pushNotification('Dev: backup-pre-scan slot deleted', 'good'))
                  .catch(() => pushNotification('Dev: no backup-pre-scan slot found', 'info'));
              }}
            >
              Delete backup-pre-scan slot
            </button>
          </div>
          <small class="dev-hint">` toggles this panel.</small>
        </div>
      )}
    </>
  );
}
