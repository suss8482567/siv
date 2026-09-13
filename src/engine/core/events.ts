import type { CityId, PlayerId, TileId, UnitId } from './types';
import type { ProductionItem } from './types';
import type { VictoryKind } from './types';

/**
 * Events returned by dispatch() — the feed UI uses for toasts, animations and
 * the notification stack. Unknown kinds must be ignored by consumers (forward
 * compatibility).
 */
export type GameEvent =
  | { kind: 'turnBegan'; playerId: PlayerId; turn: number }
  | { kind: 'unitMoved'; unitId: UnitId; tileId: TileId }
  | {
      kind: 'combatResolved';
      attackerId: UnitId;
      defenderUnitId?: UnitId;
      defenderCityId?: CityId;
      dmgToDefender: number;
      dmgToAttacker: number;
    }
  | { kind: 'unitKilled'; unitId: UnitId; byPlayerId: PlayerId; unitTypeId?: string }
  | { kind: 'unitPromoted'; unitId: UnitId; promotionId: string }
  | { kind: 'cityFounded'; cityId: CityId; tileId: TileId; name: string }
  | { kind: 'cityCaptured'; cityId: CityId; byPlayerId: PlayerId }
  | { kind: 'cityGrew'; cityId: CityId; population: number }
  | { kind: 'cityStarved'; cityId: CityId; population: number }
  | { kind: 'productionComplete'; cityId: CityId; item: ProductionItem }
  | { kind: 'researchComplete'; techId: string }
  | { kind: 'bordersExpanded'; cityId: CityId; tileIds: TileId[] }
  | { kind: 'warDeclared'; a: PlayerId; b: PlayerId }
  | { kind: 'peaceMade'; a: PlayerId; b: PlayerId }
  | { kind: 'peaceRejected'; a: PlayerId; b: PlayerId }
  | { kind: 'denounced'; byPlayerId: PlayerId; targetPlayerId: PlayerId }
  | { kind: 'playerDefeated'; playerId: PlayerId }
  | { kind: 'victoryAchieved'; playerId: PlayerId; victory: VictoryKind };
