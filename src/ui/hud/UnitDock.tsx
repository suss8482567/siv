/** Bottom-right unit panel: hidden unless one of your units is selected. */
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
  // No placeholder panel: the dock only exists while one of your units is up.
  if (!unit || unit.ownerId !== currentPlayer(state).id) return null;

  const def = buildContentDb().units[unit.typeId];
  const range = unit.movementLeft > 0 ? reachableTiles(state, unit) : new Set<number>();
  const fullRange = fullRangeTiles(state, unit);
  const canFound = unit.typeId === 'settler' && canFoundCityAt(state, unit.tileId);
  const rallySet = currentPlayer(state).rallyTileId !== undefined;

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
              {def && def.unitClass !== 'civilian' ? ` · ${def.strength} str` : ''}
              {def && def.rangedStrength > 0 ? ` · ${def.rangedStrength} rng` : ''}
            </span>
          </div>
        </div>
      </header>
      <small title="Hold the right mouse button to shade reachable tiles on the map">
        Reach {range.size} tiles now · {fullRange.size} next turn
      </small>
      {unit.gotoRally && (
        <small title="Newly built units march here; manual orders cancel it">
          Marching to rally
        </small>
      )}
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
        {(!def || def.unitClass !== 'civilian') && (
          <button
            class="btn-ghost"
            disabled={unit.fortified}
            onClick={act(() => submitCommand({ type: 'fortify', unitId: unit.id }))}
          >
            Fortify (F)
          </button>
        )}
        <button
          class="btn-ghost"
          disabled={unit.slept}
          onClick={act(() => submitCommand({ type: 'sleep', unitId: unit.id }))}
        >
          Sleep (S)
        </button>
        <button
          class="btn-ghost"
          onClick={act(() => submitCommand({ type: 'skipTurn', unitId: unit.id }))}
        >
          Skip
        </button>
        <button
          class="btn-ghost"
          data-testid="set-rally"
          title="Set the empire rally point here — newly built units march to it"
          onClick={act(() => submitCommand({ type: 'setRally', tileId: unit.tileId }))}
        >
          Rally here
        </button>
        {rallySet && (
          <button
            class="btn-ghost"
            data-testid="clear-rally"
            title="Clear the empire rally point"
            onClick={act(() => submitCommand({ type: 'setRally', tileId: null }))}
          >
            Clear rally
          </button>
        )}
        {(unit.fortified || unit.slept) && (
          <button class="btn-ghost" onClick={act(() => submitCommand({ type: 'wake', unitId: unit.id }))}>
            Wake (W)
          </button>
        )}
      </div>
    </div>
  );
}
