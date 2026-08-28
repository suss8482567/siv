/** Bottom-left panel: selected unit info + action buttons. */
import { buildContentDb } from '@/content';
import { currentPlayer } from '@/engine';
import { canFoundCityAt } from '@/engine/systems/cityFound';
import {
  fullRangeTiles,
  reachableTiles,
} from '@/engine/systems/movement';
import { unitArt } from '@/assets/art';
import { ArtIcon } from './ArtIcon';
import { selectionSignal, sessionSignal, submitCommand } from '../store';

export function UnitDock() {
  const session = sessionSignal.value;
  const { unitId, cityId } = selectionSignal.value;
  if (!session || session.state.winner) return null;
  const state = session.state;

  if (cityId != null && state.cities[cityId]) return null; // CityScreen handles it

  const unit = unitId != null ? state.units[unitId] : undefined;
  if (!unit || unit.ownerId !== currentPlayer(state).id) {
    return (
      <div class="unit-dock" data-testid="unit-dock">
        <div class="unit-dock-empty">Select a unit or city</div>
      </div>
    );
  }

  const def = buildContentDb().units[unit.typeId];
  const range = unit.movementLeft > 0 ? reachableTiles(state, unit) : new Set<number>();
  const fullRange = fullRangeTiles(state, unit);
  const canFound = unit.typeId === 'settler' && canFoundCityAt(state, unit.tileId);

  const act = (fn: () => void) => () => fn();

  return (
    <div class="unit-dock" data-testid="unit-dock">
      <header>
        <div class="unit-head">
          <ArtIcon art={unitArt(unit.typeId)} size={46} label={def?.name ?? unit.typeId} />
          <div>
            <strong>{def?.name ?? unit.typeId}</strong>
            <span>
              {unit.hp} HP · {unit.movementLeft}/{def?.moves ?? 1} MP
            </span>
          </div>
        </div>
      </header>
      <small>
        Reach now: {range.size} tiles · next turn: {fullRange.size}
      </small>
      <div class="unit-actions">
        {unit.typeId === 'settler' && (
          <button
            class="btn-primary"
            data-testid="found-city"
            disabled={!canFound}
            onClick={act(() => {
              submitCommand({ type: 'foundCity', unitId: unit.id });
              selectionSignal.value = { unitId: null, cityId: null };
            })}
          >
            Found City
          </button>
        )}
        <button
          class="btn-ghost"
          disabled={unit.fortified}
          onClick={act(() => submitCommand({ type: 'fortify', unitId: unit.id }))}
        >
          Fortify
        </button>
        <button
          class="btn-ghost"
          disabled={unit.slept}
          onClick={act(() => submitCommand({ type: 'sleep', unitId: unit.id }))}
        >
          Sleep
        </button>
        <button
          class="btn-ghost"
          onClick={act(() => submitCommand({ type: 'skipTurn', unitId: unit.id }))}
        >
          Skip
        </button>
        {(unit.fortified || unit.slept) && (
          <button class="btn-ghost" onClick={act(() => submitCommand({ type: 'wake', unitId: unit.id }))}>
            Wake
          </button>
        )}
      </div>
    </div>
  );
}
