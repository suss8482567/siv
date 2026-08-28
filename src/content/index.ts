/**
 * ContentDb: assembles and validates all content data at boot.
 * Validation failure = loud crash (bad content should never ship silently).
 */
import { z } from 'zod';
import { TERRAINS, FEATURES } from './terrains';
import { RESOURCES } from './resources';
import { PROMOTIONS } from './promotions';
import { UNITS } from './units';
import { BUILDINGS } from './buildings';
import { TECHS } from './techs';
import { CIVS } from './civs';
import {
  TerrainDefSchema,
  FeatureDefSchema,
  ResourceDefSchema,
  UnitDefSchema,
  BuildingDefSchema,
  TechDefSchema,
  CivDefSchema,
  PromotionDefSchema,
} from './schema';
import type { TerrainDef, FeatureDef, ResourceDef, UnitDef, BuildingDef, TechDef, CivDef, PromotionDef } from './schema';

export type {
  TerrainDef,
  FeatureDef,
  ResourceDef,
  ResourceKind,
  UnitDef,
  BuildingDef,
  TechDef,
  CivDef,
  Era,
  UnitClass,
} from './schema';

export { TERRAINS, FEATURES } from './terrains';
export { RESOURCES } from './resources';

export interface ContentDb {
  terrains: Record<string, TerrainDef>;
  features: Record<string, FeatureDef>;
  resources: Record<string, ResourceDef>;
  promotions: Record<string, PromotionDef>;
  units: Record<string, UnitDef>;
  buildings: Record<string, BuildingDef>;
  techs: Record<string, TechDef>;
  civs: Record<string, CivDef>;
  /** ids of civs in stable roster order (includes pseudo-civs) */
  civIds: string[];
  /** ids the player/AI roster may pick from (excludes barbarians) */
  playableCivIds: string[];
}

/** Structural parse type sidesteps zod v3 Output/Input unification issues with defaults. */
interface Parses<T> {
  parse(data: unknown): T;
}

function toRecord<T extends { id: string }>(
  schema: Parses<T>,
  items: unknown[],
  label: string,
): Record<string, T> {
  const rec: Record<string, T> = {};
  for (const item of items) {
    const parsed = schema.parse(item);
    if (rec[parsed.id]) throw new Error(`Duplicate content id in ${label}: ${parsed.id}`);
    rec[parsed.id] = parsed;
  }
  return rec;
}

let cached: ContentDb | null = null;

export function buildContentDb(): ContentDb {
  if (!cached) {
    const db: ContentDb = {
      terrains: toRecord(TerrainDefSchema, TERRAINS, 'terrains'),
      features: toRecord(FeatureDefSchema, FEATURES, 'features'),
      resources: toRecord(ResourceDefSchema, RESOURCES, 'resources'),
      promotions: toRecord(PromotionDefSchema, PROMOTIONS, 'promotions'),
      units: toRecord(UnitDefSchema, UNITS, 'units'),
      buildings: toRecord(BuildingDefSchema, BUILDINGS, 'buildings'),
      techs: toRecord(TechDefSchema, TECHS, 'techs'),
      civs: toRecord(CivDefSchema, CIVS, 'civs'),
      civIds: CIVS.map((c) => c.id),
      playableCivIds: CIVS.filter((c) => c.id !== 'barbarians').map((c) => c.id),
    };
    cached = db;
  }
  return cached;
}
