import type { FeatureDef, TerrainDef } from './schema';

/** Vector-tabletop fill colors are part of the content data, not the renderer. */
export const TERRAINS: TerrainDef[] = [
  {
    id: 'ocean',
    name: 'Ocean',
    color: '#17384f',
    movementCost: 1,
    yields: { food: 1, production: 0, gold: 0, science: 0, culture: 0 },
    isWater: true,
  },
  {
    id: 'coast',
    name: 'Coast',
    color: '#22556f',
    movementCost: 1,
    yields: { food: 1, production: 0, gold: 2, science: 0, culture: 0 },
    isWater: true,
  },
  {
    id: 'grassland',
    name: 'Grassland',
    color: '#6a8f4d',
    movementCost: 1,
    yields: { food: 2, production: 0, gold: 0, science: 0, culture: 0 },
    isWater: false,
  },
  {
    id: 'plains',
    name: 'Plains',
    color: '#a89a55',
    movementCost: 1,
    yields: { food: 1, production: 1, gold: 0, science: 0, culture: 0 },
    isWater: false,
  },
  {
    id: 'desert',
    name: 'Desert',
    color: '#c9b285',
    movementCost: 1,
    yields: { food: 0, production: 0, gold: 0, science: 0, culture: 0 },
    isWater: false,
  },
  {
    id: 'tundra',
    name: 'Tundra',
    color: '#93917b',
    movementCost: 1,
    yields: { food: 1, production: 0, gold: 0, science: 0, culture: 0 },
    isWater: false,
  },
  {
    id: 'snow',
    name: 'Snow',
    color: '#d7d7cf',
    movementCost: 1,
    yields: { food: 0, production: 0, gold: 0, science: 0, culture: 0 },
    isWater: false,
  },
];

export const FEATURES: FeatureDef[] = [
  {
    id: 'forest',
    name: 'Forest',
    movementCostDelta: 1,
    yieldsDelta: { food: 0, production: 1, gold: 0, science: 0, culture: 0 },
    defenseBonusStrength: 2,
  },
  {
    id: 'jungle',
    name: 'Jungle',
    movementCostDelta: 1,
    yieldsDelta: { food: 1, production: 0, gold: 0, science: 0, culture: 0 },
    defenseBonusStrength: 2,
  },
  {
    id: 'marsh',
    name: 'Marsh',
    movementCostDelta: 1,
    yieldsDelta: { food: -1, production: 0, gold: 0, science: 0, culture: 0 },
    defenseBonusStrength: -1,
  },
  {
    id: 'ice',
    name: 'Ice',
    movementCostDelta: 0,
    yieldsDelta: { food: 0, production: 0, gold: 0, science: 0, culture: 0 },
    defenseBonusStrength: 0,
  },
];

export function featureById(id: string): FeatureDef | undefined {
  return FEATURES.find((f) => f.id === id);
}
