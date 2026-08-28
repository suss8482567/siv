import type { PromotionDef } from './schema';

/** First-pass promotion set (M3). Effects are flat strength bonuses for now. */
export const PROMOTIONS: PromotionDef[] = [
  { id: 'shock', name: 'Shock', description: '+3 combat strength', strengthBonus: 3 },
  { id: 'drill', name: 'Drill', description: '+3 combat strength', strengthBonus: 3 },
  { id: 'march_heir', name: 'Veteran', description: '+3 combat strength', strengthBonus: 3 },
  { id: 'siege', name: 'Siege', description: '+3 vs city center', strengthBonus: 3 },
];
