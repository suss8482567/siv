import type { CityId, DevIncome, PlayerId, ProductionItem, TileId, UnitId } from './types';

/**
 * The complete verb list of the game (v0). Every mutation of GameState flows
 * through dispatch() as one of these serializable commands.
 *
 * `dev*` verbs are cheat/debug tools (dev panel): human-only, deterministic
 * (never touch the RNG stream), and applied via systems/dev.ts.
 */
export type Command =
  | { type: 'moveUnit'; unitId: UnitId; path: TileId[] }
  | { type: 'attackUnit'; attackerId: UnitId; defenderUnitId: UnitId }
  | { type: 'attackCity'; attackerId: UnitId; cityId: CityId }
  | { type: 'foundCity'; unitId: UnitId }
  | { type: 'setProduction'; cityId: CityId; item: ProductionItem }
  | { type: 'buyProduction'; cityId: CityId; item: ProductionItem }
  | { type: 'setResearch'; techId: string }
  | { type: 'fortify'; unitId: UnitId }
  | { type: 'sleep'; unitId: UnitId }
  | { type: 'wake'; unitId: UnitId }
  | { type: 'skipTurn'; unitId: UnitId }
  | { type: 'declareWar'; targetPlayerId: PlayerId }
  | { type: 'offerPeace'; targetPlayerId: PlayerId }
  | { type: 'denounce'; targetPlayerId: PlayerId }
  | { type: 'endTurn' }
  | { type: 'resign' }
  // ---- dev tools ----
  | { type: 'devRevealMap'; revealed: boolean }
  | { type: 'devSpawnUnit'; typeId: string; tileId: TileId }
  | { type: 'devSpawnCity'; tileId: TileId }
  | { type: 'devAddGold'; amount: number }
  | { type: 'devAddScience'; amount: number }
  /** techId 'all' grants every tech in the content db. */
  | { type: 'devGrantTech'; techId: string }
  | { type: 'devGrowCity'; cityId: CityId; population?: number }
  | { type: 'devAddCulture'; cityId: CityId; amount: number }
  | { type: 'devFinishProduction'; cityId: CityId }
  | { type: 'devAddBuilding'; cityId: CityId; buildingId: string }
  | { type: 'devRefreshUnits' }
  | { type: 'devSetIncome'; income: DevIncome }
  | { type: 'devSmiteBarbarians' };
