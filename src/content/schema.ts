import { z } from 'zod';

/** All gameplay numbers live here as validated data — the engine never hardcodes balance values. */

export const YieldsSchema = z.object({
  food: z.number().int().min(0).default(0),
  production: z.number().int().min(0).default(0),
  gold: z.number().int().min(0).default(0),
  science: z.number().int().min(0).default(0),
  culture: z.number().int().min(0).default(0),
});
export type Yields = z.infer<typeof YieldsSchema>;

export const EraSchema = z.enum(['ancient', 'medieval', 'renaissance']);
export type Era = z.infer<typeof EraSchema>;

export const TerrainDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(), // vector-tabletop fill (hex)
  movementCost: z.number().int().min(1),
  yields: YieldsSchema,
  isWater: z.boolean(),
});
export type TerrainDef = z.infer<typeof TerrainDefSchema>;

/** Deltas may be negative (e.g. marsh food penalty), unlike absolute yields. */
export const YieldsDeltaSchema = z.object({
  food: z.number().int(),
  production: z.number().int(),
  gold: z.number().int(),
  science: z.number().int(),
  culture: z.number().int(),
});

export const FeatureDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  movementCostDelta: z.number().int(),
  yieldsDelta: YieldsDeltaSchema,
  defenseBonusStrength: z.number().default(0),
});
export type FeatureDef = z.infer<typeof FeatureDefSchema>;

export const UnitClassSchema = z.enum([
  'melee',
  'ranged',
  'cavalry',
  'siege',
  'recon',
  'naval',
  'civilian',
]);
export type UnitClass = z.infer<typeof UnitClassSchema>;

export const UnitDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  unitClass: UnitClassSchema,
  era: EraSchema,
  cost: z.number().int().positive(),
  strength: z.number().min(0), // melee/cavalry/recon combat str; ranged attack uses rangedStrength
  rangedStrength: z.number().min(0).default(0),
  range: z.number().int().min(0).default(0),
  moves: z.number().int().min(1),
  maintenance: z.number().min(0),
  sightRange: z.number().int().min(1).default(2),
  requiresTechId: z.string().optional(), // unlocked once the owner researches this
  uniqueToCivId: z.string().optional(),
});
export type UnitDef = z.infer<typeof UnitDefSchema>;

export const BuildingDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  era: EraSchema,
  cost: z.number().int().positive(),
  maintenance: z.number().min(0),
  yields: YieldsSchema,
  isWonder: z.boolean().default(false),
  amenityPoints: z.number().int().min(0).default(0),
  /** Flat bonus added to the city's garrison defense (combat §cityDefenseStrength). */
  defenseStrength: z.number().int().min(0).default(0),
  requiresTechId: z.string().optional(),
  uniqueToCivId: z.string().optional(),
});
export type BuildingDef = z.infer<typeof BuildingDefSchema>;

export const TechLaneSchema = z.enum(['military', 'economy', 'science', 'culture']);

export const TechDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  era: EraSchema,
  lane: TechLaneSchema,
  cost: z.number().int().positive(),
  prereqIds: z.array(z.string()).default([]),
});
export type TechDef = z.infer<typeof TechDefSchema>;

export const PersonalitySchema = z.object({
  aggression: z.number().min(0).max(1),
  expansionism: z.number().min(0).max(1),
  scienceFocus: z.number().min(0).max(1),
  defensiveness: z.number().min(0).max(1),
});

export const CivDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  leaderName: z.string(),
  color: z.string(),
  traitName: z.string(),
  traitDescription: z.string(),
  personality: PersonalitySchema,
  uniqueUnitId: z.string().optional(),
  uniqueBuildingId: z.string().optional(),
  cityNames: z.array(z.string()),
});
export type CivDef = z.infer<typeof CivDefSchema>;

export const ResourceKindSchema = z.enum(['bonus', 'strategic', 'luxury']);
export type ResourceKind = z.infer<typeof ResourceKindSchema>;

export const ResourceDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: ResourceKindSchema,
  /** TerrainKind ids this resource may spawn on. */
  terrains: z.array(z.string()).min(1),
  yieldsDelta: YieldsDeltaSchema,
  /** Relative weight when rolling which resource a tile receives. */
  spawnWeight: z.number().min(0).default(1),
  /** Strategic deposits expose an extractable amount; others omit it. */
  amountMin: z.number().int().min(1).default(1),
  amountMax: z.number().int().min(1).default(1),
});
export type ResourceDef = z.infer<typeof ResourceDefSchema>;

export const PromotionDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  strengthBonus: z.number().default(0),
});
export type PromotionDef = z.infer<typeof PromotionDefSchema>;
