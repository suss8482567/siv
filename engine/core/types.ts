/**
 * Core simulation data model. POJOs only: everything here must survive a JSON
 * round-trip losslessly. No classes, no Map/Set inside GameState.
 */

export type PlayerId = number;
export type UnitId = number;
export type CityId = number;
export type TileId = number;

export type TerrainKind =
  | 'ocean'
  | 'coast'
  | 'grassland'
  | 'plains'
  | 'desert'
  | 'tundra'
  | 'snow';

export type Elevation = 'flat' | 'hills' | 'mountain';

export type FeatureKind =
  | 'forest'
  | 'jungle'
  | 'marsh'
 | 'ice'
  | 'oasis'
  | 'floodplain';

export type VictoryKind = 'domination' | 'score';

export interface Tile {
  id: TileId;
  q: number;
  r: number;
  terrain: TerrainKind;
  elevation: Elevation;
  features: FeatureKind[];
  riverEdges: boolean[];
  resourceId?: string;
  resourceAmount?: number;
  ownerPlayerId?: PlayerId;
  cityId?: CityId;
  workedByCityId?: CityId;
}

export interface Unit {
  id: UnitId;
  typeId: string;
  ownerId: PlayerId;
  tileId: TileId;
  hp: number;
  movementLeft: number;
  attacksLeft: number;
  fortified: boolean;
  slept: boolean;
  xp: number;
  promotions: string[];
}

export type ProductionKind = 'unit' | 'building';

export interface ProductionItem {
  kind: ProductionKind;
  id: string;
}

export interface City {
  id: CityId;
  name: string;
  ownerId: PlayerId;
  tileId: TileId;
  population: number;
  foodStored: number;
  productionQueue: ProductionItem[];
  productionStored: number
  buildings: string[];
  cultureStored: number;
  ownedTileIds: TileId[];
  hp: number;
  originalOwnerId: PlayerId;
  everCaptured: boolean;
}

/**
 * Flat per-turn bonus granted by the dev tools at end of turn (cheats only;
 * absent in normal play, so JSON saves and hashState stay unchanged).
 */
export interface DevIncome {
  food?: number;
  production?: number;
  gold?: number;
  science?: number;
  culture?: number;
}

export interface Personality {
  aggression: number;
  expansionism: number;
  scienceFocus: number;
  defensiveness: number;
}

export interface Player {
  id: PlayerId;
  civId: string;
  isHuman: boolean;
  alive: boolean;
  gold: number;
  researchedTechIds: string[];
  researchingTechId?: string;
  scienceStored: number;
  metPlayerIds: PlayerId[];
  relations: Record<number, number>;
  denouncedBy: PlayerId[]; warsWith: PlayerId[];
  /** targetPlayerId -> turn of last denounce (cooldown gate). */
  denounceTurns: Record<number, number>;
  exploredTileIds: TileId[]; // persistent FOW memory, sorted ascending
  /** City founded as this player's first — the M5 domination target. */
  originalCapitalCityId?: CityId;
  personality?: Personality; // AI only
  devRevealAll?: boolean; // dev tools: whole map treated as visible
  devIncome?: DevIncome; // dev tools: flat per-turn cheat income
}

export interface BarbarianCamp {
  tileId: TileId;
  /** All barbarian units attached to this camp (guards + raiders). */
  unitIds: UnitId[];
}

export interface GameState {
  version: 1;
  seed: number;
  turn: number;
  turnLimit: number;
  difficulty: number; // 0 Peaceful .. 3 Brutal
  playerOrder: PlayerId[];
  currentPlayerIndex: number;
  map: { width: number; height: number; tiles: Tile[] };
  players: Player[];
  units: Record<UnitId, Unit>;
  cities: Record<CityId, City>;
  barbarianCamps: BarbarianCamp[];
  nextUnitId: number;
  nextCityId: number;
  rngState: number;
  winner?: { playerId: PlayerId; victory: VictoryKind };
}

/** FNV-1a over stable serialization - used by golden tests / replay verification. */
export function hashState(state: GameState): string {
  const json = JSON.stringify(state);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
