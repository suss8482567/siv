/**
 * City founding (M2): settler consumption, minimum spacing, ring-1 territory
 * claims, palace to the first (capital) city, civ-flavored naming.
 */
import { buildContentDb } from '../../content';
import { hexDistance, neighborsOf, tileIndex } from '../hex/axial';
import type { Command } from '../core/commands';
import type { GameEvent } from '../core/events';
import type { CityId, GameState, TileId } from '../core/types';
import { revealAround } from './visibility';
import { noteCapital } from './victory';

/** A settler may found here: land, not mountain, >=3 tiles from any city. */
export function canFoundCityAt(state: GameState, tileId: TileId): boolean {
  const tile = state.map.tiles[tileId];
  if (!tile || tile.terrain === 'ocean' || tile.terrain === 'coast') return false;
  if (tile.elevation === 'mountain') return false;
  for (const city of Object.values(state.cities)) {
    const t = state.map.tiles[city.tileId];
    if (hexDistance(tile.q, tile.r, t.q, t.r) < 3) return false;
  }
  return true;
}

/** First unused name from the founder's civ pool; "New X" beyond that. */
function nextCityName(state: GameState, civId: string): string {
  const pool = buildContentDb().civs[civId]?.cityNames ?? [];
  const used = new Set(Object.values(state.cities).map((c) => c.name));
  for (const name of pool) if (!used.has(name)) return name;
  const base = pool[0] ?? 'City';
  let n = 2;
  while (used.has(`New ${base}${n > 2 ? ` ${n - 1}` : ''}`)) n++;
  return `New ${base}${n > 2 ? ` ${n - 1}` : ''}`;
}

/** Ring-1 tiles around the city that are unowned or already the founder's. */
function claimRing(state: GameState, cityId: CityId, playerId: number, center: TileId): TileId[] {
  const claimed: TileId[] = [center];
  const tile = state.map.tiles[center];
  tile.ownerPlayerId = playerId;
  tile.cityId = cityId;
  for (const nbAxial of neighborsOf(tile.q, tile.r)) {
    const nb = tileIndex(nbAxial.q, nbAxial.r, state.map.width, state.map.height);
    if (nb < 0) continue;
    const n = state.map.tiles[nb];
    if (n.terrain === 'ocean' || n.terrain === 'coast') continue;
    if (n.ownerPlayerId !== undefined && n.ownerPlayerId !== playerId) continue;
    n.ownerPlayerId = playerId;
    n.cityId = cityId;
    claimed.push(nb);
  }
  return claimed;
}

/** Validate + run foundCity. Returns false when illegal. */
export function applyFoundCity(state: GameState, events: GameEvent[], cmd: Command): boolean {
  if (cmd.type !== 'foundCity') return false;
  const settler = state.units[cmd.unitId];
  const actor = state.players[state.playerOrder[state.currentPlayerIndex]];
  if (!settler || settler.ownerId !== actor.id || settler.typeId !== 'settler') return false;
  if (!canFoundCityAt(state, settler.tileId)) return false;

  const cityId = state.nextCityId++;
  const name = nextCityName(state, actor.civId);
  const city = {
    id: cityId,
    name,
    ownerId: actor.id,
    tileId: settler.tileId,
    population: 1,
    foodStored: 0,
    productionQueue: [] as never[],
    productionStored: 0,
    buildings: [] as string[],
    cultureStored: 0,
    ownedTileIds: [] as TileId[],
    hp: 100,
    originalOwnerId: actor.id,
    everCaptured: false,
  };
  state.cities[cityId] = city;
  noteCapital(state, actor.id, cityId);
  city.ownedTileIds = claimRing(state, cityId, actor.id, settler.tileId);
  if (Object.values(state.cities).length === 1 || !Object.values(state.cities).some((c) => c.id !== cityId && c.buildings.includes('palace'))) {
    city.buildings.push('palace');
  }
  delete state.units[cmd.unitId];
  revealAround(state, actor.id, settler.tileId, 2);
  for (const tid of city.ownedTileIds) revealAround(state, actor.id, tid, 0);
  events.push({ kind: 'cityFounded', cityId, tileId: settler.tileId, name });
  return true;
}
