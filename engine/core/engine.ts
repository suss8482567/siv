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
import { canProduce, forceCompleteCurrentItem } from '../systems/economy';
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
      }
      break;
    }
    case 'sleep': {
      const unit = state.units[cmd.unitId];
      if (unit && unit.ownerId === actor.id) {
        unit.slept = true;
        unit.fortified = false;
        unit.movementLeft = 0;
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
    case 'setResearch': {
      if (actor.researchedTechIds.includes(cmd.techId)) break;
      actor.researchingTechId = cmd.techId;
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
        checkCampsCleared(state, events);
      }
      break;
    }
    case 'attackCity': {
      const attacker = state.units[cmd.attackerId];
      if (attacker && attacker.ownerId === actor.id && state.cities[cmd.cityId]) {
        resolveCityAttack(state, events, attacker, cmd.cityId, nextRngFraction(state));
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
