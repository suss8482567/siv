/**
 * Dev/cheat commands (debug panel). They run through the normal dispatch
 * pipeline so replays and saves stay consistent, but only the human player
 * may issue them and none of them consume the RNG stream (determinism is
 * preserved: same inputs → same hashState).
 */
import { buildContentDb } from '../../content';
import type { Command } from '../core/commands';
import type { GameEvent } from '../core/events';
import type { DevIncome, GameState, Player } from '../core/types';
import { applyFoundCity, canFoundCityAt } from './cityFound';
import { advanceResearchQueue, forceCompleteCurrentItem } from './economy';
import { spawnUnit } from './spawn';
import { revealAround, setAllTilesExplored } from './visibility';

const INCOME_KEYS = ['food', 'production', 'gold', 'science', 'culture'] as const;

/** Apply a validated dev command for the current (human) player. */
export function applyDevCommand(state: GameState, events: GameEvent[], cmd: Command): void {
  const actor = state.players[state.playerOrder[state.currentPlayerIndex]];
  if (!actor?.isHuman) return;

  switch (cmd.type) {
    case 'devRevealMap': {
      if (cmd.revealed) actor.devRevealAll = true;
      else delete actor.devRevealAll; // absent beats false: cleaner saves/hashes
      setAllTilesExplored(state, actor.id, cmd.revealed);
      break;
    }
    case 'devSpawnUnit': {
      const def = buildContentDb().units[cmd.typeId];
      if (!def) break;
      if (cmd.tileId < 0 || !state.map.tiles[cmd.tileId]) break;
      const unit = spawnUnit(state, actor.id, cmd.typeId, cmd.tileId);
      revealAround(state, actor.id, unit.tileId, def.sightRange);
      break;
    }
    case 'devSpawnCity': {
      // Found directly via the normal rules (spacing, territory, naming) by
      // borrowing a throwaway settler — no settler consumed on invalid spots.
      if (!canFoundCityAt(state, cmd.tileId)) break;
      const settler = spawnUnit(state, actor.id, 'settler', cmd.tileId);
      applyFoundCity(state, events, { type: 'foundCity', unitId: settler.id });
      break;
    }
    case 'devAddGold': {
      actor.gold = Math.max(0, actor.gold + Math.round(cmd.amount));
      break;
    }
    case 'devAddScience': {
      actor.scienceStored = Math.max(0, actor.scienceStored + Math.round(cmd.amount));
      break;
    }
    case 'devGrantTech': {
      grantTechs(actor, cmd.techId);
      break;
    }
    case 'devGrowCity': {
      const city = state.cities[cmd.cityId];
      if (!city || city.ownerId !== actor.id) break;
      city.population += Math.max(1, Math.round(cmd.population ?? 1));
      events.push({ kind: 'cityGrew', cityId: city.id, population: city.population });
      break;
    }
    case 'devAddCulture': {
      const city = state.cities[cmd.cityId];
      if (!city || city.ownerId !== actor.id) break;
      city.cultureStored = Math.max(0, city.cultureStored + Math.round(cmd.amount));
      break;
    }
    case 'devFinishProduction': {
      const city = state.cities[cmd.cityId];
      if (city && city.ownerId === actor.id) forceCompleteCurrentItem(state, events, city);
      break;
    }
    case 'devAddBuilding': {
      const city = state.cities[cmd.cityId];
      if (!city || city.ownerId !== actor.id) break;
      if (!buildContentDb().buildings[cmd.buildingId]) break;
      if (!city.buildings.includes(cmd.buildingId)) city.buildings.push(cmd.buildingId);
      break;
    }
    case 'devRefreshUnits': {
      const content = buildContentDb();
      for (const unit of Object.values(state.units)) {
        if (unit.ownerId !== actor.id) continue;
        const def = content.units[unit.typeId];
        unit.hp = 100;
        unit.movementLeft = def?.moves ?? 2;
        unit.attacksLeft = 1;
      }
      break;
    }
    case 'devSetIncome': {
      const cleaned: DevIncome = {};
      for (const key of INCOME_KEYS) {
        const v = Math.max(0, Math.round(cmd.income[key] ?? 0));
        if (v > 0) cleaned[key] = v;
      }
      if (Object.keys(cleaned).length > 0) actor.devIncome = cleaned;
      else delete actor.devIncome; // absent beats zeroed: keeps saves/hash clean
      break;
    }
    case 'devSmiteBarbarians': {
      smiteBarbarians(state);
      break;
    }
    default:
      break; // not a dev command
  }
}

function grantTechs(player: Player, techId: string): void {
  const content = buildContentDb();
  const targets =
    techId === 'all'
      ? Object.keys(content.techs)
      : content.techs[techId]
        ? [techId]
        : [];
  let grantedCurrent = false;
  for (const id of targets) {
    if (!player.researchedTechIds.includes(id)) player.researchedTechIds.push(id);
    if (player.researchingTechId === id) grantedCurrent = true;
  }
  if (grantedCurrent) player.researchingTechId = undefined; // nothing left to research there
  if (player.researchQueue) {
    player.researchQueue = player.researchQueue.filter((id) => !player.researchedTechIds.includes(id));
    if (player.researchQueue.length === 0) delete player.researchQueue;
    else if (grantedCurrent) advanceResearchQueue(player);
  }
}

/** Remove every barbarian unit and camp. Pays no clearing gold (it's a cheat). */
function smiteBarbarians(state: GameState): void {
  const barbarianIds = new Set(
    state.players.filter((p) => p.civId === 'barbarians').map((p) => p.id),
  );
  if (barbarianIds.size === 0 && state.barbarianCamps.length === 0) return;
  for (const unit of Object.values(state.units)) {
    if (barbarianIds.has(unit.ownerId)) delete state.units[unit.id];
  }
  state.barbarianCamps = [];
}
