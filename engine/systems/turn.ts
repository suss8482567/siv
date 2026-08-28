/**
 * Turn flow (M2): end-of-turn economy processing and start-of-turn unit
 * refresh; M3 adds combat healing and diplomacy contact discovery.
 */
import { buildContentDb } from '../../content';
import type { GameEvent } from '../core/events';
import type { GameState, PlayerId } from '../core/types';
import { processCity, processPlayerEconomy } from './economy';
import { healUnits } from './combat';
import { discoverContacts, updateRelations } from './diplomacy';

/** Economy tick for every city + treasury/science of `playerId`. */
export function endOfTurnForPlayer(state: GameState, events: GameEvent[], playerId: PlayerId): void {
  discoverContacts(state, playerId);
  updateRelations(state, playerId);
  // Dev-tools flat income lands before the city tick so food/production/
  // culture bonuses count toward growth, builds and borders this same turn.
  const bonus = state.players[playerId]?.devIncome;
  if (bonus) {
    for (const city of Object.values(state.cities)) {
      if (city.ownerId !== playerId) continue;
      city.foodStored += bonus.food ?? 0;
      city.productionStored += bonus.production ?? 0;
      city.cultureStored += bonus.culture ?? 0;
    }
  }
  for (const city of Object.values(state.cities)) {
    if (city.ownerId === playerId) processCity(state, events, city);
  }
  processPlayerEconomy(state, events, playerId);
}

/** Restore movement/attacks for all of `playerId`'s units; heal the wounded. */
export function beginTurnForPlayer(state: GameState, playerId: PlayerId): void {
  const content = buildContentDb();
  healUnits(state, playerId);
  for (const unit of Object.values(state.units)) {
    if (unit.ownerId !== playerId) continue;
    const def = content.units[unit.typeId];
    unit.movementLeft = def?.moves ?? 2;
    unit.attacksLeft = 1;
    if (unit.fortified || unit.slept) {
      // Fortified/slept units stay put until woken manually or attacked.
      unit.movementLeft = 0;
    }
  }
}
