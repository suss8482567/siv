import type { Command } from './commands';
import type { GameEvent } from './events';
import { nextRngFraction } from './rng';
import type { GameState, Player } from './types';
import { applyMoveUnit } from '../systems/movement';
import { applyFoundCity } from '../systems/cityFound';
import { canAttackUnit, resolveAttack, resolveCityAttack } from '../systems/combat';
import { applyDeclareWar, applyDenounce, applyOfferPeace } from '../systems/diplomacy';
import { checkCampsCleared, runBarbarianPhase } from '../systems/barbarian';
import { applyDevCommand } from '../systems/dev';
import { runAiTurn } from '../systems/ai/planner';
import { buildContentDb } from '../../content';
import { canProduce, forceCompleteCurrentItem, MAX_PRODUCTION_QUEUE } from '../systems/economy';
import { endOfTurnForPlayer, beginTurnForPlayer } from '../systems/turn';
import { awardScoreVictory, checkDomination, checkEliminations } from '../systems/victory';

export interface DispatchResult {
  events: GameEvent[];
}

export function currentPlayer(state: GameState): Player {
  return state.players[state.playerOrder[state.currentPlayerIndex]];
}

/**
 * Single entry point for all state mutation. Validates the command against the
 * current player, applies it via the matching system, and returns the events
 * produced.
 */
export function dispatch(state: GameState, cmd: Command): DispatchResult {
  const events: GameEvent[] = [];
  // The game is over; every command is a no-op once a winner exists.
  if (state.winner) return { events };
  const actor = currentPlayer(state);

  switch (cmd.type) {
    case 'resign': {
      if (!actor.isHuman) throw new Error('Only the human can resign');
      actor.alive = false;
      events.push({ kind: 'playerDefeated', playerId: actor.id });
      // Resigning ends the game immediately: the best live rival wins by score.
      // With no live rival left, winner stays unset and VictoryScreen still
      // shows Defeat via the dead-human branch.
      awardScoreVictory(state, events);
      break;
    }
    case 'moveUnit': {
      const unit = state.units[cmd.unitId];
      if (!unit || unit.ownerId !== actor.id) return { events };
      applyMoveUnit(state, events, cmd);
      break;
    }
    case 'foundCity': {
      applyFoundCity(state, events, cmd);
      break;
    }
    case 'fortify': {
      const unit = state.units[cmd.unitId];
      if (unit && unit.ownerId === actor.id) {
        unit.fortified = true;
        unit.slept = false;
        unit.movementLeft = 0;
        delete unit.gotoRally;
      }
      break;
    }
    case 'sleep': {
      const unit = state.units[cmd.unitId];
      if (unit && unit.ownerId === actor.id) {
        unit.slept = true;
        unit.fortified = false;
        unit.movementLeft = 0;
        delete unit.gotoRally;
      }
      break;
    }
    case 'wake':
    case 'skipTurn': {
      const unit = state.units[(cmd as { unitId: number }).unitId];
      if (unit && unit.ownerId === actor.id) {
        unit.slept = false;
        if (cmd.type === 'wake') unit.fortified = false;
        else unit.movementLeft = 0;
      }
      break;
    }
    case 'setProduction': {
      const city = state.cities[cmd.cityId];
      if (city && city.ownerId === actor.id && canProduce(state, actor.id, city, cmd.item)) {
        city.productionQueue = [cmd.item];
      }
      break;
    }
    case 'queueProduction': {
      const city = state.cities[cmd.cityId];
      if (!city || city.ownerId !== actor.id) break;
      if (city.productionQueue.length >= MAX_PRODUCTION_QUEUE) break;
      if (!canProduce(state, actor.id, city, cmd.item)) break;
      city.productionQueue = [...city.productionQueue, cmd.item];
      break;
    }
    case 'dequeueProduction': {
      const city = state.cities[cmd.cityId];
      if (!city || city.ownerId !== actor.id) break;
      if (cmd.index < 0 || cmd.index >= city.productionQueue.length) break;
      city.productionQueue = city.productionQueue.filter((_, i) => i !== cmd.index);
      break;
    }
    case 'reorderProduction': {
      const city = state.cities[cmd.cityId];
      if (!city || city.ownerId !== actor.id) break;
      const n = city.productionQueue.length;
      const { fromIndex, toIndex } = cmd;
      if (fromIndex < 0 || fromIndex >= n || toIndex < 0 || toIndex >= n) break;
      if (fromIndex === toIndex) break;
      const next = [...city.productionQueue];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      city.productionQueue = next;
      break;
    }
    case 'buyProduction': {
      const city = state.cities[cmd.cityId];
      if (
        city &&
        city.ownerId === actor.id &&
        city.productionQueue[0]?.id === cmd.item.id &&
        canProduce(state, actor.id, city, cmd.item)
      ) {
        const def = cmd.item.kind === 'unit'
          ? buildContentDb().units[cmd.item.id]
          : buildContentDb().buildings[cmd.item.id];
        if (!def) break;
        const remaining = Math.max(0, def.cost - city.productionStored);
        const cost = Math.ceil(remaining * 3);
        if (cost === 0) break; // already finished — no need to pay
        if (actor.gold >= cost) {
          actor.gold -= cost;
          city.productionStored = def.cost;
          forceCompleteCurrentItem(state, events, city);
        }
      }
      break;
    }
    case 'setProductionRepeat': {
      const city = state.cities[cmd.cityId];
      if (!city || city.ownerId !== actor.id) break;
      // Absent-when-off keeps saves and hashState clean (devIncome precedent).
      if (cmd.repeat) city.productionRepeat = true;
      else delete city.productionRepeat;
      break;
    }
    case 'setCityFocus': {
      const city = state.cities[cmd.cityId];
      if (!city || city.ownerId !== actor.id) break;
      if (cmd.focus === 'balanced') delete city.focus;
      else if (['growth', 'production', 'gold', 'science', 'culture'].includes(cmd.focus)) {
        city.focus = cmd.focus;
      }
      break;
    }
    case 'setRally': {
      if (cmd.tileId === null) {
        delete actor.rallyTileId;
        break;
      }
      // Any real tile takes the rally; unreachable goals self-heal (flag clears).
      if (state.map.tiles[cmd.tileId]) actor.rallyTileId = cmd.tileId;
      break;
    }
    case 'setResearch': {
      if (actor.researchedTechIds.includes(cmd.techId)) break;
      actor.researchingTechId = cmd.techId;
      // A manually picked tech leaves the queue (no stale dupes behind it).
      if (actor.researchQueue) {
        actor.researchQueue = actor.researchQueue.filter((id) => id !== cmd.techId);
        if (actor.researchQueue.length === 0) delete actor.researchQueue;
      }
      break;
    }
    case 'queueResearch': {
      const content = buildContentDb();
      if (!content.techs[cmd.techId]) break;
      if (actor.researchedTechIds.includes(cmd.techId)) break;
      if (actor.researchingTechId === cmd.techId) break;
      const queue = actor.researchQueue ?? [];
      if (queue.includes(cmd.techId)) break;
      queue.push(cmd.techId);
      actor.researchQueue = queue;
      // Queueing into an idle lab starts it immediately.
      if (!actor.researchingTechId) actor.researchingTechId = queue.shift();
      if (queue.length === 0) delete actor.researchQueue;
      else actor.researchQueue = queue;
      break;
    }
    case 'dequeueResearch': {
      if (!actor.researchQueue) break;
      actor.researchQueue = actor.researchQueue.filter((id) => id !== cmd.techId);
      if (actor.researchQueue.length === 0) delete actor.researchQueue;
      break;
    }
    case 'endTurn': {
      endOfTurnForPlayer(state, events, actor.id);
      advanceToNextPlayer(state, events);
      break;
    }
    case 'attackUnit': {
      const attacker = state.units[cmd.attackerId];
      const defender = state.units[cmd.defenderUnitId];
      if (attacker && defender && attacker.ownerId === actor.id && canAttackUnit(state, attacker, defender)) {
        resolveAttack(state, events, attacker, defender, nextRngFraction(state));
        delete attacker.gotoRally;
        checkCampsCleared(state, events);
      }
      break;
    }
    case 'attackCity': {
      const attacker = state.units[cmd.attackerId];
      if (attacker && attacker.ownerId === actor.id && state.cities[cmd.cityId]) {
        resolveCityAttack(state, events, attacker, cmd.cityId, nextRngFraction(state));
        delete attacker.gotoRally;
        checkCampsCleared(state, events);
      }
      break;
    }
    case 'declareWar': {
      applyDeclareWar(state, events, actor.id, cmd.targetPlayerId);
      break;
    }
    case 'offerPeace': {
      const outcome = applyOfferPeace(state, events, actor.id, cmd.targetPlayerId);
      if (outcome === 'rejected') {
        events.push({ kind: 'peaceRejected', a: actor.id, b: cmd.targetPlayerId });
      }
      break;
    }
    case 'denounce': {
      applyDenounce(state, events, actor.id, cmd.targetPlayerId);
      break;
    }
    // Dev tools (human-only inside applyDevCommand; deterministic).
    case 'devRevealMap':
    case 'devSpawnUnit':
    case 'devSpawnCity':
    case 'devAddGold':
    case 'devAddScience':
    case 'devGrantTech':
    case 'devGrowCity':
    case 'devAddCulture':
    case 'devFinishProduction':
    case 'devAddBuilding':
    case 'devRefreshUnits':
    case 'devSetIncome':
    case 'devSmiteBarbarians': {
      applyDevCommand(state, events, cmd);
      break;
    }
    default:
      throw new Error(`Command not implemented yet: ${(cmd as { type: string }).type}`);
  }

  return { events };
}

function advanceToNextPlayer(state: GameState, events: GameEvent[]): void {
  // AI players take their full turns inline; control lands on the next human.
  let steps = 0;
  do {
    state.currentPlayerIndex += 1;
    if (state.currentPlayerIndex >= state.playerOrder.length) {
      state.currentPlayerIndex = 0;
      state.turn += 1;
      runBarbarianPhase(state, events);
      checkEliminations(state, events);
      if (!state.winner && state.turn > state.turnLimit) awardScoreVictory(state, events);
      if (!state.winner) checkDomination(state, events);
    }
    const arriving = state.players[state.playerOrder[state.currentPlayerIndex]];
    if (!arriving.alive) continue;
    beginTurnForPlayer(state, arriving.id);
    if (!arriving.isHuman) {
      runAiTurn(state, events, arriving.id);
      endOfTurnForPlayer(state, events, arriving.id);
    }
    steps += 1;
  } while (
    (() => {
      const cur = state.players[state.playerOrder[state.currentPlayerIndex]];
      return !cur || !cur.isHuman || !cur.alive;
    })() &&
    steps <= (state.playerOrder.length + 1) * 2
  );
  const arriving = state.players[state.playerOrder[state.currentPlayerIndex]];
  if (arriving?.alive) {
    events.push({ kind: 'turnBegan', playerId: arriving.id, turn: state.turn });
  }
}
