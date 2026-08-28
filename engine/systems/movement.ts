/**
 * Movement (M2): terrain/feature enter costs, 1UPT occupancy, zone-of-control
 * stopping, river-crossing MP wipe, civilian capture.
 */
import { buildContentDb } from '../../content';
import { findPath, type AStarContext } from '../hex/pathfind';
import { HEX_DIRECTIONS, axialToOffset, neighborsOf } from '../hex/axial';
import type { Command } from '../core/commands';
import type { GameEvent } from '../core/events';
import type { GameState, TileId, Unit } from '../core/types';
import { revealAround } from './visibility';

/** Tile entry cost for a unit (Infinity = impassable). Mountains block all; water blocks until naval era content lands. */
export function enterCostFor(state: GameState, unit: Unit, toTileId: TileId): number {
  const content = buildContentDb();
  const tile = state.map.tiles[toTileId];
  if (!tile) return Infinity;
  if (tile.elevation === 'mountain') return Infinity;
  if (tile.terrain === 'ocean' || tile.terrain === 'coast') return Infinity;
  let cost = content.terrains[tile.terrain]?.movementCost ?? 1;
  for (const f of tile.features) cost += content.features[f]?.movementCostDelta ?? 0;
  return Math.max(1, cost);
}

export function unitAt(state: GameState, tileId: TileId): Unit | undefined {
  for (const u of Object.values(state.units)) {
    if (u.tileId === tileId) return u;
  }
  return undefined;
}

export function unitsAt(state: GameState, tileId: TileId): Unit[] {
  return Object.values(state.units).filter((u) => u.tileId === tileId);
}

/** True when any enemy military unit stands adjacent to `tileId` (zone of control). */
export function zocAt(state: GameState, unit: Unit, tileId: TileId): boolean {
  const tile = state.map.tiles[tileId];
  if (!tile) return false;
  for (const nb of neighborsOf(tile.q, tile.r)) {
    const { col, row } = axialToOffset(nb.q, nb.r);
    if (col < 0 || col >= state.map.width || row < 0 || row >= state.map.height) continue;
    for (const u of unitsAt(state, row * state.map.width + col)) {
      if (u.ownerId === unit.ownerId) continue;
      const def = buildContentDb().units[u.typeId];
      if (!def || def.unitClass === 'civilian') continue;
      return true;
    }
  }
  return false;
}

/** A* context honoring occupancy + terrain costs. */
function astarContext(state: GameState, unit: Unit): AStarContext {
  return {
    tileCount: state.map.tiles.length,
    neighbors: (tileId: number) => {
      const t = state.map.tiles[tileId];
      const out: number[] = [];
      if (!t) return out;
      for (const nb of neighborsOf(t.q, t.r)) {
        const { col, row } = axialToOffset(nb.q, nb.r);
        if (col < 0 || col >= state.map.width || row < 0 || row >= state.map.height) continue;
        out.push(row * state.map.width + col);
      }
      return out;
    },
    enterCost: (tileId: number) => {
      // Destination occupied by another unit blocks the path (civilian capture
      // is handled at execution time on the final step only).
      const occ = unitAt(state, tileId);
      if (occ && occ.id !== unit.id) return Infinity;
      return enterCostFor(state, unit, tileId);
    },
    heuristic: (a: number, b: number) => {
      const ta = state.map.tiles[a];
      const tb = state.map.tiles[b];
      if (!ta || !tb) return 0;
      const dq = ta.q - tb.q;
      const dr = ta.r - tb.r;
      return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
    },
  };
}

export function findUnitPath(state: GameState, unit: Unit, goalTileId: TileId): TileId[] | null {
  if (goalTileId === unit.tileId) return null;
  const goal = state.map.tiles[goalTileId];
  if (!goal) return null;
  return findPath(astarContext(state, unit), unit.tileId, goalTileId);
}

/**
 * Walk a validated path as far as the movement budget allows. Emits one
 * unitMoved event per step. River crossings wipe remaining MP; entering enemy
 * ZOC ends the move; stepping onto an enemy civilian captures it.
 */
export function executeMove(
  state: GameState,
  events: GameEvent[],
  unit: Unit,
  path: TileId[],
): void {
  for (let i = 1; i < path.length; i++) {
    if (unit.movementLeft <= 0) break;
    const from = state.map.tiles[unit.tileId];
    const toIdx = path[i];
    const to = state.map.tiles[toIdx];
    if (!from || !to) break;
    // Validate contiguity.
    let dir = -1;
    for (let d = 0; d < 6; d++) {
      if (from.q + HEX_DIRECTIONS[d].q === to.q && from.r + HEX_DIRECTIONS[d].r === to.r) {
        dir = d;
        break;
      }
    }
    if (dir < 0) break;
    // Occupancy: only enemy civilians may be entered (capture).
    const occ = unitAt(state, toIdx);
    if (occ && occ.id !== unit.id) {
      const occDef = buildContentDb().units[occ.typeId];
      if (!occDef || occDef.unitClass !== 'civilian' || occ.ownerId === unit.ownerId) break;
    }
    const cost = enterCostFor(state, unit, toIdx);
    if (cost === Infinity) break;
    const crossingRiver = from.riverEdges[dir];
    if (unit.movementLeft < cost && !(crossingRiver && unit.movementLeft > 0)) {
      unit.movementLeft = 0;
      break;
    }
    // Capture enemy civilian on contact.
    if (occ) {
      occ.ownerId = unit.ownerId;
      occ.movementLeft = 0;
      occ.fortified = false;
      occ.slept = false;
      unit.movementLeft = 0;
    } else {
      unit.movementLeft -= cost;
    }
    unit.tileId = toIdx;
    unit.fortified = false;
    unit.slept = false;
    revealAround(state, unit.ownerId, toIdx, sightOf(unit));
    events.push({ kind: 'unitMoved', unitId: unit.id, tileId: toIdx });
    if (crossingRiver) unit.movementLeft = 0;
    if (occ || zocAt(state, unit, toIdx)) {
      unit.movementLeft = 0;
      break;
    }
  }
}

/** Tiles reachable with the unit's remaining MP (for UI shading). */
export function reachableTiles(state: GameState, unit: Unit): Set<TileId> {
  const budget = unit.movementLeft;
  const dist = new Map<TileId, number>([[unit.tileId, 0]]);
  const frontier: TileId[] = [unit.tileId];
  while (frontier.length > 0) {
    frontier.sort((a, b) => (dist.get(a) ?? 0) - (dist.get(b) ?? 0) || a - b);
    const cur = frontier.shift()!;
    const curD = dist.get(cur) ?? 0;
    if (curD >= budget) continue;
    // Entering ZOC or crossing a river ends the move, like executeMove
    const from = state.map.tiles[cur];
    for (const nb of astarContext(state, unit).neighbors(cur)) {
      const cost = enterCostFor(state, unit, nb);
      if (cost === Infinity) continue;
      // Occupancy already blocked via enterCost, but double-check for civilian capture distance
      let dir = -1;
      const toTile = state.map.tiles[nb];
      if (from && toTile) {
        for (let d = 0; d < 6; d++) {
          if (from.q + HEX_DIRECTIONS[d].q === toTile.q && from.r + HEX_DIRECTIONS[d].r === toTile.r) { dir = d; break; }
        }
      }
      const crossingRiver = dir >= 0 && from?.riverEdges[dir];
      let nd: number;
      let endsMove = false;
      if (crossingRiver) {
        // River crossing consumes all remaining MP regardless of cost (if we have any MP)
        if (curD >= budget) continue;
        nd = budget;
        endsMove = true;
      } else {
        nd = curD + cost;
        if (nd > budget) continue;
        // Entering enemy ZOC consumes remaining budget
        if (zocAt(state, unit, nb)) {
          nd = budget;
          endsMove = true;
        }
      }
      if (nd < (dist.get(nb) ?? Infinity)) {
        dist.set(nb, nd);
        if (!endsMove) frontier.push(nb);
        // If endsMove, we record the tile as reachable but don't expand beyond it
      }
    }
  }
  dist.delete(unit.tileId);
  return new Set(dist.keys());
}

/** Tiles the unit could reach on a fresh turn (full MP). */
export function fullRangeTiles(state: GameState, unit: Unit): Set<TileId> {
  const fresh: Unit = { ...unit, movementLeft: buildContentDb().units[unit.typeId].moves };
  return reachableTiles(state, fresh);
}

function sightOf(unit: Unit): number {
  return buildContentDb().units[unit.typeId]?.sightRange ?? 2;
}

/** Validate + run a moveUnit command. Returns false when illegal. */
export function applyMoveUnit(state: GameState, events: GameEvent[], cmd: Command): boolean {
  if (cmd.type !== 'moveUnit') return false;
  const unit = state.units[cmd.unitId];
  if (!unit || unit.ownerId !== state.players[state.playerOrder[state.currentPlayerIndex]].id) {
    return false;
  }
  if (cmd.path.length === 0 || cmd.path[0] !== unit.tileId) return false;
  const path = cmd.path.length === 1 ? findUnitPath(state, unit, cmd.path[0]) : cmd.path;
  if (!path) return false;
  executeMove(state, events, unit, path);
  return true;
}
